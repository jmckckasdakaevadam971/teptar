import { SiteHeader } from "@/components/SiteHeader/SiteHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { KeepersSection } from "@/components/landing/KeepersSection";
import { AboutSection } from "@/components/landing/AboutSection";
import { FaqSection, FAQ_ITEMS } from "@/components/landing/FaqSection";
import { SiteFooter } from "@/components/SiteFooter/SiteFooter";

const SITE = "https://vorhda.ru";

// Структурированные данные (schema.org) для поисковиков:
// организация, сайт и блок вопросов-ответов (rich snippets в выдаче).
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "Vorhda · Ворх Да",
      url: SITE,
      logo: `${SITE}/logo-square.svg`,
      email: "vorhda@yandex.com",
      description:
        "Платформа родовой памяти чеченских тейпов: родовые древа, справочник тейпов и сёл, поиск предков.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      name: "Vorhda — Родовое древо чеченских тейпов",
      alternateName: ["Ворх Да", "Vorhda.ru"],
      url: SITE,
      inLanguage: "ru",
      publisher: { "@id": `${SITE}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE}/#faq`,
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default function Page() {
  return (
    <main className="relative min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <HeroSection />

      <FeaturesSection />
      <AboutSection />
      <KeepersSection />
      <FaqSection />
      <SiteFooter />
    </main>
  );
}