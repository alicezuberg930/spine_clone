from __future__ import annotations

import numpy as np

from utils.cv import alpha_bbox, expand_bbox_to_square, safe_crop_xywh


def test_alpha_bbox_returns_none_for_an_empty_head_mask() -> None:
    empty_head = np.zeros((64, 64, 4), dtype=np.uint8)

    assert alpha_bbox(empty_head) is None


def test_hair_bbox_produces_a_nonempty_fallback_head_crop() -> None:
    hair_mask = np.zeros((100, 120), dtype=np.uint8)
    hair_mask[20:40, 50:70] = 255

    hair_bbox = alpha_bbox(hair_mask)
    fallback_bbox = expand_bbox_to_square(
        hair_bbox,
        hair_mask.shape,
        expansion=3.0,
        vertical_bias=0.25,
    )
    source = np.zeros((100, 120, 4), dtype=np.uint8)
    crop, crop_box = safe_crop_xywh(source, fallback_bbox, padding_ratio=0.0)

    assert fallback_bbox == (30, 5, 60, 60)
    assert crop_box == (30, 5, 90, 65)
    assert crop is not None
    assert crop.shape == (60, 60, 4)


def test_safe_crop_rejects_empty_boxes_and_clamps_to_the_source() -> None:
    source = np.zeros((20, 30, 4), dtype=np.uint8)

    assert safe_crop_xywh(source, (0, 0, 0, 0)) == (None, None)

    crop, crop_box = safe_crop_xywh(
        source,
        (-10, -5, 25, 20),
        padding_ratio=0.0,
    )

    assert crop_box == (0, 0, 15, 15)
    assert crop is not None
    assert crop.shape == (15, 15, 4)
