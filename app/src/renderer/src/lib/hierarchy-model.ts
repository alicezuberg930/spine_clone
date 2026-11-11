interface HierarchyConstraint {
  id: string
  name: string
  type: 'physics' | 'ik' | 'transform' | 'path' | 'slider'
}

export interface ConstraintTreeNode {
  id: string
  name: string
  type: 'constraint'
  depth: number
}

const constraintTypeOrder: Record<HierarchyConstraint['type'], number> = {
  transform: 0,
  ik: 1,
  path: 2,
  physics: 3,
  slider: 4
}

const constraintLabels: Record<string, string> = {
  'constraint-gaze': 'Transform · gaze driver',
  'constraint-hand-ik': 'IK · hand aim',
  'constraint-foot-ik': 'IK · grounded foot',
  'constraint-scarf-path': 'Path · scarf flow',
  'constraint-cape-physics': 'Physics · hair tips'
}

const constraintTypeLabels: Record<HierarchyConstraint['type'], string> = {
  transform: 'Transform',
  ik: 'IK',
  path: 'Path',
  physics: 'Physics',
  slider: 'Slider'
}

export function createConstraintTreeNodes(
  constraints: readonly HierarchyConstraint[]
): ConstraintTreeNode[] {
  return constraints
    .map((constraint, index) => ({ constraint, index }))
    .sort(
      (left, right) =>
        constraintTypeOrder[left.constraint.type] - constraintTypeOrder[right.constraint.type] ||
        left.index - right.index
    )
    .map(({ constraint }) => ({
      id: constraint.id,
      name:
        constraintLabels[constraint.id] ??
        `${constraintTypeLabels[constraint.type]} · ${constraint.name}`,
      type: 'constraint',
      depth: 2
    }))
}
