'use client'

import { SiteHeader } from '@/components/SiteHeader/SiteHeader'
import { HeroSection } from '@/components/landing/HeroSection'
import { StatsStrip } from '@/components/landing/StatsStrip'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { AboutSection } from '@/components/landing/AboutSection'
import { SiteFooter } from '@/components/SiteFooter/SiteFooter'

export default function Page() {
  return (
    <main className="relative min-h-screen bg-background">
      <SiteHeader />
      <HeroSection />
      <div className="relative z-10 -mt-10 md:-mt-14">
        <StatsStrip />
      </div>

      <FeaturesSection />
      <AboutSection />
      <SiteFooter />
    </main>
  )
}
