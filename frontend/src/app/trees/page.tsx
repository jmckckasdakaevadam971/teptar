import { PageShell } from '@/components/PageShell/PageShell'
import { TreesView } from '@/components/TreesView/TreesView'

export default function TreesPage() {
  return (
    <PageShell
      eyebrow="Дошлол · Общая база"
      title="Древа"
      description="Опубликованные и проверенные родословные. Ищите по фамилии, тейпу, селу или городу и переходите к любому древу."
    >
      <TreesView />
    </PageShell>
  )
}
