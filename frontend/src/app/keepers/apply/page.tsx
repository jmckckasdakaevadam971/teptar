import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell/PageShell";
import { KeeperApplyForm } from "@/components/KeepersView/KeeperApplyForm";

export const metadata: Metadata = {
  title: "Стать хранителем тептара",
  description:
    "Подайте заявку на роль хранителя тептара: расскажите, какой тейп вы знаете и откуда ваши знания. Помогите сохранить родовую память.",
  alternates: { canonical: "/keepers/apply" },
};

export default function KeeperApplyPage() {
  return (
    <PageShell
      title="Стать хранителем"
      description="Расскажите, какой тейп вы знаете и откуда ваши знания. Мы свяжемся с вами и дадим права хранителя."
    >
      <KeeperApplyForm />
    </PageShell>
  );
}
