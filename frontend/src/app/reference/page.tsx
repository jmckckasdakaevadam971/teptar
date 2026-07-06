import type { Metadata } from 'next'
import { PageShell } from '@/components/PageShell/PageShell'
import { DirectoryView } from '@/components/DirectoryView/DirectoryView'

export const metadata: Metadata = {
  title: 'Справочник чеченских тейпов и тукхумов',
  description:
    'Полный справочник чеченских тейпов, тукхумов, гаров и родовых сёл: принадлежность родов, история и краткие сведения о каждом тейпе.',
  alternates: { canonical: '/reference' },
}

export default function ReferencePage() {
  return (
    <PageShell
      title="Справочник тейпов"
      description="Краткие сведения о чеченских тейпах и тукхумах — история и принадлежность родов."
    >
      <DirectoryView />
    </PageShell>
  )
}
