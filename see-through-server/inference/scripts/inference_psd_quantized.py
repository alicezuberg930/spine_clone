"""Quantized inference for See-through full pipeline (layerdiff body -> head -> marigold depth -> PSD).

Supports NF4 (default, 4-bit) and bf16 (baseline) modes. HF repos are auto-selected
based on quant_mode. Builds pipelines directly without using inference_utils global singletons.

Usage (from repo root):
    python inference/scripts/inference_psd_quantized.py --srcp image.png --save_to_psd
    python inference/scripts/inference_psd_quantized.py --quant_mode none --no_group_offload
"""

import os.path as osp
import argparse
import sys
import os
sys.path.append(osp.dirname(osp.dirname(osp.abspath(__file__))))

default_n_threads = 8
os.environ['OPENBLAS_NUM_THREADS'] = f"{default_n_threads}"
os.environ['MKL_NUM_THREADS'] = f"{default_n_threads}"
os.environ['OMP_NUM_THREADS'] = f"{default_n_threads}"

import json
import time
import cv2
import numpy as np
import torch
from PIL import Image

from modules.layerdiffuse.diffusers_kdiffusion_sdxl import KDiffusionStableDiffusionXLPipeline
from modules.layerdiffuse.vae import TransparentVAE
from modules.layerdiffuse.layerdiff3d import UNetFrameConditionModel
from modules.marigold import MarigoldDepthPipeline
from utils.cv import (
    alpha_bbox,
    center_square_pad_resize,
    expand_bbox_to_square,
    img_alpha_blending,
    safe_crop_xywh,
    smart_resize,
)
from utils.torch_utils import seed_everything
from utils.io_utils import json2dict, dict2json
from utils.inference_utils import further_extr
from utils.cv import validate_resolution


VALID_BODY_PARTS_V2 = [
    'hair', 'headwear', 'face', 'eyes', 'eyewear', 'ears', 'earwear', 'nose', 'mouth',
    'neck', 'neckwear', 'topwear', 'handwear', 'bottomwear', 'legwear', 'footwear',
    'tail', 'wings', 'objects'
]


PROGRESS_PREFIX = "SEE_THROUGH_PROGRESS "


def emit_progress(stage, message, current=None, total=None):
    """Emit a machine-readable progress event without replacing CLI output."""
    event = {
        "stage": stage,
        "message": message,
        "current": current,
        "total": total,
    }
    print(PROGRESS_PREFIX + json.dumps(event, separators=(",", ":")), flush=True)


def build_layerdiff_pipeline(args):
    """Build the LayerDiff3D pipeline with appropriate quantization."""
    quant_mode = args.quant_mode

    if quant_mode == 'none':
        # bf16 baseline: load from original repo
        repo = args.repo_id_layerdiff
        trans_vae = TransparentVAE.from_pretrained(repo, subfolder='trans_vae')
        unet = UNetFrameConditionModel.from_pretrained(repo, subfolder='unet')
        pipeline = KDiffusionStableDiffusionXLPipeline.from_pretrained(
            repo, trans_vae=trans_vae, unet=unet, scheduler=None)
        if args.cpu_offload:
            pipeline.vae.to(dtype=torch.bfloat16)
            pipeline.trans_vae.to(dtype=torch.bfloat16)
            pipeline.unet.to(dtype=torch.bfloat16)
            pipeline.text_encoder.to(dtype=torch.bfloat16)
            pipeline.text_encoder_2.to(dtype=torch.bfloat16)
            pipeline.enable_model_cpu_offload()
        else:
            pipeline.vae.to(dtype=torch.bfloat16, device='cuda')
            pipeline.trans_vae.to(dtype=torch.bfloat16, device='cuda')
            pipeline.unet.to(dtype=torch.bfloat16, device='cuda')
            pipeline.text_encoder.to(dtype=torch.bfloat16, device='cuda')
            pipeline.text_encoder_2.to(dtype=torch.bfloat16, device='cuda')
            if getattr(args, 'group_offload', False):
                pipeline.enable_group_offload('cuda', num_blocks_per_group=1)
        # Cache tag embeddings and unload text encoders to save VRAM
        pipeline.cache_tag_embeds()
    else:
        # NF4: load from pre-quantized repo (auto-selected by REPO_MAP)
        repo = args.repo_id_layerdiff
        unet = UNetFrameConditionModel.from_pretrained(repo, subfolder='unet')

        trans_vae = TransparentVAE.from_pretrained(repo, subfolder='trans_vae')  # always bf16
        pipeline = KDiffusionStableDiffusionXLPipeline.from_pretrained(
            repo, trans_vae=trans_vae, unet=unet, scheduler=None)

        if args.cpu_offload:
            # VAE + TransparentVAE to bf16; quantized components handled by bnb
            pipeline.vae.to(dtype=torch.bfloat16)
            pipeline.trans_vae.to(dtype=torch.bfloat16)
            pipeline.enable_model_cpu_offload()
        else:
            pipeline.vae.to(dtype=torch.bfloat16, device='cuda')
            pipeline.trans_vae.to(dtype=torch.bfloat16, device='cuda')
            # Don't manually .to(cuda) quantized components -- bnb handles device placement
            if getattr(args, 'group_offload', False):
                pipeline.enable_group_offload('cuda', num_blocks_per_group=1)
        # Cache tag embeddings and unload text encoders to save VRAM
        pipeline.cache_tag_embeds()

    return pipeline


def build_marigold_pipeline(args):
    """Build the Marigold depth pipeline with appropriate quantization."""
    quant_mode = args.quant_mode

    if quant_mode == 'none':
        repo = args.repo_id_depth
        unet = UNetFrameConditionModel.from_pretrained(repo, subfolder='unet')
        marigold_pipe = MarigoldDepthPipeline.from_pretrained(repo, unet=unet)
        if args.cpu_offload:
            marigold_pipe.to(dtype=torch.bfloat16)
            marigold_pipe.enable_model_cpu_offload()
        else:
            marigold_pipe.to(device='cuda', dtype=torch.bfloat16)
            if getattr(args, 'group_offload', False):
                marigold_pipe.enable_group_offload('cuda', num_blocks_per_group=1)
        marigold_pipe.cache_tag_embeds()
    else:
        # NF4: load from pre-quantized repo (auto-selected by REPO_MAP)
        repo = args.repo_id_depth
        unet = UNetFrameConditionModel.from_pretrained(repo, subfolder='unet', torch_dtype=torch.bfloat16)

        marigold_pipe = MarigoldDepthPipeline.from_pretrained(repo, unet=unet, torch_dtype=torch.bfloat16)
        marigold_pipe.vae.to(device='cuda')
        marigold_pipe.unet.to(device='cuda')
        # Text encoder may be quantized (from pre-quantized repo) — only move device, not dtype
        if not getattr(marigold_pipe.text_encoder, 'is_quantized', False) and \
           not getattr(marigold_pipe.text_encoder, 'quantization_method', None):
            marigold_pipe.text_encoder.to(device='cuda')
        if getattr(args, 'group_offload', False):
            marigold_pipe.enable_group_offload('cuda', num_blocks_per_group=1)
        marigold_pipe.cache_tag_embeds()

    return marigold_pipe


def run_layerdiff(pipeline, imgp, save_dir, seed, num_inference_steps, resolution):
    """Run LayerDiff3D body + head passes. Replicates inference_utils.py v3 logic exactly."""
    saved = osp.join(save_dir, osp.splitext(osp.basename(imgp))[0])
    os.makedirs(saved, exist_ok=True)
    input_img = np.array(Image.open(imgp).convert('RGBA'))
    fullpage, pad_size, pad_pos = center_square_pad_resize(input_img, resolution, return_pad_info=True)
    scale = pad_size[0] / resolution
    Image.fromarray(fullpage).save(osp.join(saved, 'src_img.png'))

    rng = torch.Generator(device=pipeline.unet.device).manual_seed(seed)

    # Body pass
    body_tag_list = ['front hair', 'back hair', 'head', 'neck', 'neckwear', 'topwear', 'handwear', 'bottomwear', 'legwear', 'footwear', 'tail', 'wings', 'objects']
    emit_progress('body', 'Generating body layers', 0, num_inference_steps)
    pipeline_output = pipeline(
        strength=1.0,
        num_inference_steps=num_inference_steps,
        batch_size=1,
        generator=rng,
        guidance_scale=1.0,
        prompt=body_tag_list,
        negative_prompt='',
        fullpage=fullpage,
        group_index=0
    )
    images = pipeline_output.images
    for rst, tag in zip(pipeline_output.images, body_tag_list):
        Image.fromarray(rst).save(osp.join(saved, f'{tag}.png'))
    emit_progress('body', 'Generating body layers', num_inference_steps, num_inference_steps)
    head_img = images[2]

    # Head crop
    head_tag_list = ['headwear', 'face', 'irides', 'eyebrow', 'eyewhite', 'eyelash', 'eyewear', 'ears', 'earwear', 'nose', 'mouth']
    head_bbox = alpha_bbox(head_img)
    using_fallback_crop = head_bbox is None

    if head_bbox is None:
        hair_mask = np.zeros(head_img.shape[:2], dtype=np.uint8)
        for hair_tag in ('front hair', 'back hair'):
            hair_image = images[body_tag_list.index(hair_tag)]
            if hair_image.shape[:2] == hair_mask.shape:
                hair_mask = np.maximum(hair_mask, hair_image[..., -1])
        hair_bbox = alpha_bbox(hair_mask)
        head_bbox = expand_bbox_to_square(
            hair_bbox,
            head_img.shape,
            expansion=3.0,
            vertical_bias=0.25,
        )
        if head_bbox is not None:
            print(
                'Warning: head mask was empty; using an expanded hair-based head crop.',
                flush=True,
            )
        else:
            head_bbox = (0, 0, head_img.shape[1], head_img.shape[0])
            print(
                'Warning: head and hair masks were empty; using the full source image for the head pass.',
                flush=True,
            )

    hx0, hy0, hw, hh = head_bbox

    hx = int(hx0 * scale) - pad_pos[0]
    hy = int(hy0 * scale) - pad_pos[1]
    hw = max(1, int(hw * scale))
    hh = max(1, int(hh * scale))

    input_head, crop_box = safe_crop_xywh(
        input_img,
        (hx, hy, hw, hh),
        padding_ratio=0.0 if using_fallback_crop else 0.2,
    )
    if input_head is None or crop_box is None:
        input_head = input_img.copy()
        crop_box = (0, 0, input_img.shape[1], input_img.shape[0])
        using_fallback_crop = True
        print(
            'Warning: mapped head crop was empty; using the full source image for the head pass.',
            flush=True,
        )

    hx1, hy1, hx2, hy2 = crop_box
    hx1 = int(hx1 / scale + pad_pos[0] / scale)
    hy1 = int(hy1 / scale + pad_pos[1] / scale)
    ih, iw = input_head.shape[:2]
    input_head, pad_size, pad_pos = center_square_pad_resize(input_head, resolution, return_pad_info=True)
    Image.fromarray(input_head).save(osp.join(saved, 'src_head.png'))

    # Head pass
    emit_progress('head', 'Generating head details', 0, num_inference_steps)
    pipeline_output = pipeline(
        strength=1.0,
        num_inference_steps=num_inference_steps,
        batch_size=1,
        generator=rng,
        guidance_scale=1.0,
        prompt=head_tag_list,
        negative_prompt='',
        fullpage=input_head,
        group_index=1
    )
    canvas = np.zeros((resolution, resolution, 4), dtype=np.uint8)

    py1, py2, px1, px2 = (np.array([pad_pos[1], pad_pos[1] + ih, pad_pos[0], pad_pos[0] + iw]) / scale).astype(np.int64)

    scale_size = (
        max(1, int(pad_size[0] / scale)),
        max(1, int(pad_size[1] / scale)),
    )

    for rst, tag in zip(pipeline_output.images, head_tag_list):
        rst = smart_resize(rst, scale_size)
        crop_y1 = max(0, min(rst.shape[0], int(py1)))
        crop_y2 = max(crop_y1, min(rst.shape[0], int(py2)))
        crop_x1 = max(0, min(rst.shape[1], int(px1)))
        crop_x2 = max(crop_x1, min(rst.shape[1], int(px2)))
        rst = rst[crop_y1:crop_y2, crop_x1:crop_x2]
        full = canvas.copy()
        target_x1 = max(0, hx1)
        target_y1 = max(0, hy1)
        target_x2 = min(resolution, hx1 + rst.shape[1])
        target_y2 = min(resolution, hy1 + rst.shape[0])
        if target_x2 > target_x1 and target_y2 > target_y1:
            source_x1 = target_x1 - hx1
            source_y1 = target_y1 - hy1
            source_x2 = source_x1 + target_x2 - target_x1
            source_y2 = source_y1 + target_y2 - target_y1
            full[target_y1:target_y2, target_x1:target_x2] = rst[
                source_y1:source_y2,
                source_x1:source_x2,
            ]
        Image.fromarray(full).save(osp.join(saved, f'{tag}.png'))
    emit_progress('head', 'Generating head details', num_inference_steps, num_inference_steps)


def run_marigold(marigold_pipe, srcp, save_dir, seed, resolution_depth):
    """Run Marigold depth estimation. Matches inference_utils.apply_marigold logic.

    Uses resolution_depth to control Marigold inference resolution. If different from
    source image size, images are resized before depth prediction and depth maps are
    resized back after. All frames processed together (no chunking).
    """
    srcname = osp.basename(osp.splitext(srcp)[0])
    saved = osp.join(save_dir, srcname)

    # Read source image to get actual size (matches inference_utils approach)
    src_img_p = osp.join(saved, 'src_img.png')
    fullpage = np.array(Image.open(src_img_p).convert('RGBA'))
    src_h, src_w = fullpage.shape[:2]

    if isinstance(resolution_depth, int) and resolution_depth == -1:
        resolution_depth = [src_h, src_w]
    resolution_depth = validate_resolution(resolution_depth)
    src_rescaled = resolution_depth[0] != src_h or resolution_depth[1] != src_w

    img_list = []
    exist_list = []
    empty_array = np.zeros((src_h, src_w, 4), dtype=np.uint8)
    blended_alpha = np.zeros((src_h, src_w), dtype=np.float32)

    compose_list = {'eyes': ['eyewhite', 'irides', 'eyelash', 'eyebrow'], 'hair': ['back hair', 'front hair']}
    for tag in VALID_BODY_PARTS_V2:
        tagp = osp.join(saved, f'{tag}.png')
        if osp.exists(tagp):
            exist_list.append(True)
            tag_arr = np.array(Image.open(tagp))
            tag_arr[..., -1][tag_arr[..., -1] < 15] = 0
            img_list.append(tag_arr)
        else:
            img_list.append(empty_array)
            exist_list.append(False)

    compose_dict = {}
    for c, clist in compose_list.items():
        imlist = []
        taglist = []
        for tag in clist:
            p = osp.join(saved, tag + '.png')
            if osp.exists(p):
                tag_arr = np.array(Image.open(p))
                tag_arr[..., -1][tag_arr[..., -1] < 15] = 0
                imlist.append(tag_arr)
                taglist.append(tag)
        if len(imlist) > 0:
            img = img_alpha_blending(imlist, premultiplied=False)
            img_list[VALID_BODY_PARTS_V2.index(c)] = img
            compose_dict[c] = {'taglist': taglist, 'imlist': imlist}

    for img in img_list:
        blended_alpha += img[..., -1].astype(np.float32) / 255

    blended_alpha = np.clip(blended_alpha, 0, 1) * 255
    blended_alpha = blended_alpha.astype(np.uint8)
    fullpage[..., -1] = blended_alpha
    img_list.append(fullpage)

    # Resize to depth resolution if needed
    img_list_input = img_list
    if src_rescaled:
        img_list_input = [smart_resize(img, resolution_depth) for img in img_list]

    seed_everything(seed)
    depth_steps = int(getattr(marigold_pipe, 'default_denoising_steps', 4) or 4)
    emit_progress('depth', 'Estimating layer depth', 0, depth_steps)
    pipe_out = marigold_pipe(color_map=None, img_list=img_list_input)
    depth_pred = pipe_out.depth_tensor
    depth_pred = depth_pred.to(device='cpu', dtype=torch.float32).numpy()

    # Resize depth back to source resolution if needed
    if src_rescaled:
        depth_pred = [smart_resize(d, (src_h, src_w)) for d in depth_pred]

    drawables = [{'img': img, 'depth': depth} for img, depth in zip(img_list, depth_pred)]
    drawables = drawables[:-1]
    blended = img_alpha_blending(drawables, premultiplied=False)

    infop = osp.join(saved, 'info.json')
    if osp.exists(infop):
        info = json2dict(infop)
    else:
        info = {'parts': {}}

    parts = info['parts']
    for ii, depth in enumerate(depth_pred[:-1]):
        depth = (np.clip(depth, 0, 1) * 255).astype(np.uint8)
        tag = VALID_BODY_PARTS_V2[ii]
        if tag in compose_dict:
            mask = blended_alpha > 256
            for t, im in zip(compose_dict[tag]['taglist'][::-1], compose_dict[tag]['imlist'][::-1]):
                mask_local = im[..., -1] > 15
                mask_invis = np.bitwise_and(mask, mask_local)
                depth_local = np.full((src_h, src_w), fill_value=255, dtype=np.uint8)
                depth_local[mask_local] = depth[mask_local]
                if np.any(mask_invis):
                    depth_local[mask_invis] = np.median(depth[np.bitwise_and(mask_local, np.bitwise_not(mask_invis))])
                mask = np.bitwise_or(mask, mask_local)

                parts_info = parts.get(t, {})
                Image.fromarray(depth_local).save(osp.join(saved, f'{t}_depth.png'))
                parts[t] = parts_info
            continue

        parts_info = parts.get(tag, {})
        Image.fromarray(depth).save(osp.join(saved, f'{tag}_depth.png'))
        parts[tag] = parts_info

    dict2json(info, infop)
    Image.fromarray(blended).save(osp.join(saved, 'reconstruction.png'))
    emit_progress('depth', 'Estimating layer depth', depth_steps, depth_steps)


if __name__ == '__main__':

    parser = argparse.ArgumentParser(
        description="Quantized inference: LayerDiff body+head -> Marigold depth -> PSD"
    )
    parser.add_argument('--srcp', type=str, default='assets/test_image.png', help='input image')
    parser.add_argument('--save_dir', type=str, default='workspace/layerdiff_output')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--resolution', type=int, default=1280)
    parser.add_argument('--save_to_psd', action='store_true')
    parser.add_argument('--tblr_split', action='store_true',
                        help='try split parts (handwear, eyes, etc) into left-right components')
    parser.add_argument('--quant_mode', type=str, default='nf4', choices=['nf4', 'none'],
                        help='quantization mode: nf4 (default, 4-bit) or none (bf16 baseline)')
    parser.add_argument('--repo_id_layerdiff', type=str, default=None,
                        help='Override LayerDiff3D HF repo (auto-selected based on quant_mode)')
    parser.add_argument('--repo_id_depth', type=str, default=None,
                        help='Override Marigold3D HF repo (auto-selected based on quant_mode)')
    parser.add_argument('--cpu_offload', action='store_true', default=False,
                        help='enable model CPU offload (default: on)')
    parser.add_argument('--no_cpu_offload', action='store_false', dest='cpu_offload',
                        help='disable model CPU offload')
    parser.add_argument('--num_inference_steps', type=int, default=30)
    parser.add_argument('--resolution_depth', type=int, default=768,
                        help='Marigold depth inference resolution (default 768; -1 to match layerdiff resolution)')
    parser.add_argument('--group_offload', action='store_true', default=True,
                        help='Enable group offload to reduce peak VRAM (default: on)')
    parser.add_argument('--no_group_offload', action='store_false', dest='group_offload',
                        help='Disable group offload for faster inference on high-VRAM GPUs')
    args = parser.parse_args()

    # Auto-select HF repos based on quant_mode
    REPO_MAP = {
        'nf4': {
            'layerdiff': '24yearsold/seethroughv0.0.2_layerdiff3d_nf4',
            'depth': '24yearsold/seethroughv0.0.1_marigold_nf4',
        },
        'none': {
            'layerdiff': 'layerdifforg/seethroughv0.0.2_layerdiff3d',
            'depth': '24yearsold/seethroughv0.0.1_marigold',
        },
    }
    defaults = REPO_MAP[args.quant_mode]
    if args.repo_id_layerdiff is None:
        args.repo_id_layerdiff = defaults['layerdiff']
    if args.repo_id_depth is None:
        args.repo_id_depth = defaults['depth']

    srcp = args.srcp
    seed = args.seed
    resolution = args.resolution
    num_inference_steps = args.num_inference_steps
    save_dir = args.save_dir
    srcname = osp.basename(osp.splitext(srcp)[0])
    saved = osp.join(save_dir, srcname)

    print(f"Quantized inference: quant_mode={args.quant_mode}, cpu_offload={args.cpu_offload}")
    print(f"  Source image: {srcp}")
    print(f"  Save dir: {save_dir}")
    print(f"  Resolution: {resolution}, Steps: {num_inference_steps}, Seed: {seed}")

    torch.cuda.reset_peak_memory_stats()
    total_t0 = time.time()

    # --- LayerDiff ---
    print('\nBuilding LayerDiff3D pipeline...')
    emit_progress('loading_layerdiff', 'Loading the layer model')
    seed_everything(seed)
    pipeline = build_layerdiff_pipeline(args)

    print('Running LayerDiff3D (body + head)...')
    layerdiff_t0 = time.time()
    run_layerdiff(pipeline, srcp, save_dir, seed, num_inference_steps, resolution)
    layerdiff_time = time.time() - layerdiff_t0
    print(f'  LayerDiff3D done in {layerdiff_time:.1f}s')

    # Free layerdiff pipeline before loading marigold
    del pipeline
    torch.cuda.empty_cache()

    # --- Marigold ---
    print('\nBuilding Marigold depth pipeline...')
    emit_progress('loading_depth', 'Loading the depth model')
    marigold_pipe = build_marigold_pipeline(args)

    print('Running Marigold depth...')
    marigold_t0 = time.time()
    run_marigold(marigold_pipe, srcp, save_dir, seed, resolution_depth=args.resolution_depth)
    marigold_time = time.time() - marigold_t0
    print(f'  Marigold done in {marigold_time:.1f}s')

    # Free marigold pipeline before PSD assembly
    del marigold_pipe
    torch.cuda.empty_cache()

    # --- PSD assembly ---
    print('\nRunning PSD assembly...')
    emit_progress('psd', 'Assembling the layered PSD', 0, 1)
    psd_t0 = time.time()
    further_extr(saved, rotate=False, save_to_psd=args.save_to_psd, tblr_split=args.tblr_split)
    psd_time = time.time() - psd_t0
    emit_progress('psd', 'Assembling the layered PSD', 1, 1)
    print(f'  PSD assembly done in {psd_time:.1f}s')

    total_time = time.time() - total_t0

    # --- Stats ---
    stats = {
        'quant_mode': args.quant_mode,
        'peak_vram_gb': torch.cuda.max_memory_allocated() / 1024**3,
        'layerdiff_time_s': layerdiff_time,
        'marigold_time_s': marigold_time,
        'psd_time_s': psd_time,
        'total_time_s': total_time,
    }
    print(f'\n{"="*60}')
    print(json.dumps(stats, indent=2))
    print(f'{"="*60}')
    with open(osp.join(saved, 'stats.json'), 'w') as f:
        json.dump(stats, f, indent=2)
    print(f'Stats saved to {osp.join(saved, "stats.json")}')
