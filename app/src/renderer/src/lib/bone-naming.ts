import type { Bone } from '@/@types'

export function normalizeBoneName(value: string): string {
  return value.trim()
}

export function boneNameValidationError(
  bones: readonly Pick<Bone, 'id' | 'name'>[],
  boneId: string,
  value: string
): string | null {
  const name = normalizeBoneName(value)
  if (!name) return 'Bone name is required.'

  const normalizedName = name.toLocaleLowerCase()
  const duplicate = bones.some(
    (bone) => bone.id !== boneId && bone.name.trim().toLocaleLowerCase() === normalizedName
  )
  return duplicate ? `A bone named “${name}” already exists.` : null
}
