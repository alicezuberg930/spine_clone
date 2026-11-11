import type { Bone } from '@/@types'

export interface BoneBindingOption {
  value: string | null
  label: string
}

/**
 * Builds the complete list shown by a rigid artwork binding control.
 *
 * Bone creation appends to the project's bone array, so preserving that order
 * keeps newly authored bones visible after the existing rig bones.
 */
export function createBoneBindingOptions(
  bones: readonly Pick<Bone, 'id' | 'name'>[]
): BoneBindingOption[] {
  return [
    { value: null, label: 'Unbound' },
    ...bones.map((bone) => ({ value: bone.id, label: bone.name }))
  ]
}
