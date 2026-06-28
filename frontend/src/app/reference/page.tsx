import type { Metadata } from 'next'
import { PageShell } from '@/components/PageShell/PageShell'
import { DirectoryView } from '@/components/DirectoryView/DirectoryView'

export const metadata: Metadata = {
  title: 'Справочник тейпов — Vorhda',
  description:
    'Справочник чеченских тейпов и тукхумов: принадлежность родов и краткие сведения.',
}

export default function ReferencePage() {
  return (
    <PageShell
      eyebrow="Тайпанаш · Справочник"
      title="Справочник тейпов"
      description="Краткие сведения о чеченских тейпах и тукхумах — история и принадлежность родов."
    >
      <DirectoryView />
    </PageShell>
  )
}
