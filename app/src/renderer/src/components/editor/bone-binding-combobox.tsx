import { useMemo } from 'react'

import type { Bone } from '@/@types'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from '@/components/ui/combobox'
import { createBoneBindingOptions, type BoneBindingOption } from '@/lib/bone-binding-options'

interface BoneBindingComboboxProps {
  bones: readonly Bone[]
  value: string | null
  onValueChange: (boneId: string | null) => void
}

export function BoneBindingCombobox({
  bones,
  value,
  onValueChange
}: BoneBindingComboboxProps): React.JSX.Element {
  const options = useMemo(() => createBoneBindingOptions(bones), [bones])
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  return (
    <Combobox
      items={options}
      value={selectedOption}
      itemToStringLabel={(option: BoneBindingOption) => option.label}
      isItemEqualToValue={(option: BoneBindingOption, selected: BoneBindingOption) =>
        option.value === selected.value
      }
      onValueChange={(option: BoneBindingOption | null) => onValueChange(option?.value ?? null)}
    >
      <ComboboxInput
        aria-label="Rigid bone binding"
        placeholder="Search bones..."
        className="h-8 w-full bg-background/35 text-xs"
      />
      <ComboboxContent className="min-w-52">
        <ComboboxEmpty>No matching bones.</ComboboxEmpty>
        <ComboboxList className="max-h-56 overflow-y-scroll pr-1 scrollbar-thin">
          {(option: BoneBindingOption) => (
            <ComboboxItem key={option.value ?? 'unbound'} value={option} className="text-xs">
              <span className="truncate">{option.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
