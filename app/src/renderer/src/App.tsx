import { EditorProvider } from '@/hooks/use-editor-state'
import { EditorLayout } from '@/layouts/editor-layout'

function App(): React.JSX.Element {
  return (
    <EditorProvider>
      <EditorLayout />
    </EditorProvider>
  )
}

export default App
