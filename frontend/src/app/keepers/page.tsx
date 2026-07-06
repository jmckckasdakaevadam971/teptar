import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell/PageShell";
import { KeepersView } from "@/components/KeepersView/KeepersView";

export const metadata: Metadata = {
  title: "Хранители тептара",
  description:
    "Хранители тептара — знатоки своих тейпов, которые проверяют родословные и берегут достоверность общей базы родовых древ.",
  alternates: { canonical: "/keepers" },
};

export default function KeepersPage() {
  return (
    <PageShell
      title="Хранители тептара"
      description="Каждый тейп заслуживает своего знатока. Хранители проверяют родословные своего тейпа, сверяют имена и даты — и берегут память рода от ошибок."
    >
      <KeepersView />
    </PageShell>
  );
}
