import {
  AudioLines,
  Box,
  ChevronRight,
  CircleHelp,
  FileArchive,
  FileDown,
  FileImage,
  FileJson,
  FilePlus2,
  FolderOpen,
  Frame,
  Grid3X3,
  Import,
  Keyboard,
  Layers3,
  PackageOpen,
  Redo2,
  RotateCcw,
  Save,
  ScanLine,
  Sparkles,
  Undo2
} from 'lucide-react'

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from '@/components/ui/menubar'

interface EditorMenubarProps {
  onNewProject: () => void
  onImportArtwork: () => void
  onFeatureNotImplemented: (feature: string) => void
  onInsertKey: () => void
  onResetDemo: () => void
  onToggle: (
    key: 'showGrid' | 'showBones' | 'showMesh' | 'showBounds' | 'ghosting' | 'audioEnabled'
  ) => void
  flags: Record<
    'showGrid' | 'showBones' | 'showMesh' | 'showBounds' | 'ghosting' | 'audioEnabled',
    boolean
  >
}

export function EditorMenubar({
  onNewProject,
  onImportArtwork,
  onFeatureNotImplemented,
  onInsertKey,
  onResetDemo,
  onToggle,
  flags
}: EditorMenubarProps): React.JSX.Element {
  return (
    <Menubar className="h-8 rounded-none border-0 bg-transparent p-0 shadow-none">
      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">File</MenubarTrigger>
        <MenubarContent className="w-60">
          <MenubarItem onClick={onNewProject}>
            <FilePlus2 /> New project
            <MenubarShortcut>Ctrl+N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => onFeatureNotImplemented('Open project')}>
            <FolderOpen /> Open project…
            <MenubarShortcut>Ctrl+O</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>
              <Import /> Import
            </MenubarSubTrigger>
            <MenubarSubContent className="w-56">
              <MenubarItem onClick={() => onFeatureNotImplemented('Import skeleton data')}>
                <FileJson /> Skeleton data…
              </MenubarItem>
              <MenubarItem onClick={() => onFeatureNotImplemented('Import project')}>
                <PackageOpen /> Project…
              </MenubarItem>
              <MenubarItem onClick={onImportArtwork}>
                <Layers3 /> Layered artwork / PSD…
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem onClick={() => onFeatureNotImplemented('Save project')}>
            <Save /> Save project
            <MenubarShortcut>Ctrl+S</MenubarShortcut>
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>
              <FileDown /> Export
            </MenubarSubTrigger>
            <MenubarSubContent className="w-56">
              <MenubarItem onClick={() => onFeatureNotImplemented('Export skeleton data')}>
                <FileJson /> Skeleton data
              </MenubarItem>
              <MenubarItem onClick={() => onFeatureNotImplemented('Export image sequence or GIF')}>
                <FileImage /> Image sequence / GIF
              </MenubarItem>
              <MenubarItem onClick={() => onFeatureNotImplemented('Export video')}>
                <Frame /> Video
              </MenubarItem>
              <MenubarItem onClick={() => onFeatureNotImplemented('Export texture atlas')}>
                <FileArchive /> Texture atlas
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">Edit</MenubarTrigger>
        <MenubarContent className="w-52">
          <MenubarItem onClick={() => onFeatureNotImplemented('Undo')}>
            <Undo2 /> Undo
            <MenubarShortcut>Ctrl+Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => onFeatureNotImplemented('Redo')}>
            <Redo2 /> Redo
            <MenubarShortcut>Ctrl+Y</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onResetDemo}>
            <RotateCcw /> Reset demo pose
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">View</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarCheckboxItem
            checked={flags.showGrid}
            onCheckedChange={() => onToggle('showGrid')}
          >
            <Grid3X3 /> Grid
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={flags.showBones}
            onCheckedChange={() => onToggle('showBones')}
          >
            <ScanLine /> Skeleton overlay
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={flags.showMesh}
            onCheckedChange={() => onToggle('showMesh')}
          >
            <Layers3 /> Mesh overlay
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={flags.showBounds}
            onCheckedChange={() => onToggle('showBounds')}
          >
            <Box /> Bounding boxes
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={flags.ghosting}
            onCheckedChange={() => onToggle('ghosting')}
          >
            <Sparkles /> Ghosting
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={flags.audioEnabled}
            onCheckedChange={() => onToggle('audioEnabled')}
          >
            <AudioLines /> Audio waveform
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">Animate</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarItem onClick={onInsertKey}>
            <Frame /> Insert key
            <MenubarShortcut>K</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => onFeatureNotImplemented('Preview mixing')}>
            <ChevronRight /> Preview mixing
          </MenubarItem>
          <MenubarItem onClick={() => onFeatureNotImplemented('Key constrained values')}>
            <ScanLine /> Key constrained values
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="h-7 px-2 text-xs font-medium">Help</MenubarTrigger>
        <MenubarContent className="w-60">
          <MenubarItem onClick={() => onFeatureNotImplemented('Keyboard shortcuts')}>
            <Keyboard /> Keyboard shortcuts
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => onFeatureNotImplemented('Editor guide')}>
            <CircleHelp /> Editor guide
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
