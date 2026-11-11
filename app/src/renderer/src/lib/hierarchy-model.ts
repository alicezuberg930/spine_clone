interface HierarchyConstraint {
  id: string
  name: string
  type: 'physics' | 'ik' | 'transform' | 'path' | 'slider'
}

export interface FlatHierarchyRow {
  id: string
  depth: number
}

/**
 * Applies expansion state to a depth-ordered, pre-order hierarchy.
 *
 * The row that owns a deeper following row is its parent. A collapsed row
 * remains visible while every descendant below it is hidden. Callers should
 * bypass this helper while filtering if matching descendants must be revealed.
 */
export function visibleHierarchyRows<T extends FlatHierarchyRow>(
  rows: readonly T[],
  collapsedIds: ReadonlySet<string>
): T[] {
  const ancestors: T[] = []

  return rows.filter((row) => {
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].depth >= row.depth) {
      ancestors.pop()
    }

    const visible = ancestors.every((ancestor) => !collapsedIds.has(ancestor.id))
    ancestors.push(row)
    return visible
  })
}

/** Keeps matching rows and their ancestor chain in the original tree order. */
export function filterHierarchyRows<T extends FlatHierarchyRow>(
  rows: readonly T[],
  matches: (row: T) => boolean
): T[] {
  const ancestors: T[] = []
  const includedIds = new Set<string>()

  rows.forEach((row) => {
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].depth >= row.depth) {
      ancestors.pop()
    }
    if (matches(row)) {
      ancestors.forEach((ancestor) => includedIds.add(ancestor.id))
      includedIds.add(row.id)
    }
    ancestors.push(row)
  })

  return rows.filter((row) => includedIds.has(row.id))
}

export function hierarchyRowHasChildren<T extends FlatHierarchyRow>(
  rows: readonly T[],
  index: number
): boolean {
  const row = rows[index]
  const next = rows[index + 1]
  return Boolean(row && next && next.depth > row.depth)
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
