"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Users,
  CreditCard,
  PiggyBank,
  Shield,
  Clock,
  BarChart3,
  CheckCircle,
  Star,
  ArrowRight,
  Menu,
  X,
  MapPin,
  Phone,
  Mail,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import Image from "next/image"

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center space-x-2">
                <div className="h-8 w-auto">
                  <Image
                    src="https://res.cloudinary.com/hatari/image/upload/v1756392459/sente-loans/logos/sente-loans-full-logo-cropped_zbrxed.png"
                    alt="Sente Loan"
                    width={120}
                    height={32}
                    className="h-8 w-auto hidden sm:block"
                  />
                  <Image
                    src="https://res.cloudinary.com/hatari/image/upload/v1756391632/sente-loans/logos/sente-loans-symbol-logo_jyteeu.png"
                    alt="Sente Loan"
                    width={32}
                    height={32}
                    className="h-8 w-auto sm:hidden"
                  />
                </div>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <a
                  href="#features"
                  className="text-muted-foreground hover:text-foreground px-3 py-2 text-sm font-medium"
                >
                  Features
                </a>
                <a
                  href="#pricing"
                  className="text-muted-foreground hover:text-foreground px-3 py-2 text-sm font-medium"
                >
                  Pricing
                </a>
                <a
                  href="#testimonials"
                  className="text-muted-foreground hover:text-foreground px-3 py-2 text-sm font-medium"
                >
                  Testimonials
                </a>
                <a href="#faq" className="text-muted-foreground hover:text-foreground px-3 py-2 text-sm font-medium">
                  FAQ
                </a>
              </div>
            </div>

            <div className="hidden md:flex items-center space-x-4">
              <Link href="/login">
                <Button variant="ghost">Login</Button>
              </Link>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <Button variant="ghost" size="sm" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t">
              <a
                href="#features"
                className="block px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="block px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground"
              >
                Pricing
              </a>
              <a
                href="#testimonials"
                className="block px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground"
              >
                Testimonials
              </a>
              <a
                href="#faq"
                className="block px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground"
              >
                FAQ
              </a>
              <div className="px-3 py-2 space-y-2">
                <Link href="/login" className="block">
                  <Button variant="ghost" className="w-full">
                    Login
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-balance mb-6">
              Simplify Loan Management for Your
              <span className="text-primary"> Sacco and Money Lending Business</span>
            </h1>
            <p className="text-xl text-muted-foreground text-pretty mb-8 max-w-2xl mx-auto">
              The complete loan management platform designed specifically for SACCOs and Money Lenders in Uganda.
              Streamline loan processing, track repayments, and manage borrowers with powerful tools built for your
              business needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <a
                href="https://wa.me/256787624334?text=Hello%20David%2C%20I%20would%20like%20to%20know%20more%20about%20Senteloans"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="lg" className="text-lg px-8 py-3">
                  Chat with us <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <a href="https://forms.gle/vpTQvomDsQPNSqPy6" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="text-lg px-8 py-3 bg-transparent">
                  Schedule Demo
                </Button>
              </a>
            </div>

            {/* Hero Image - Dashboard Preview */}
            <div className="relative max-w-6xl mx-auto">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl blur-3xl"></div>
                <div className="relative bg-white rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
                  <div className="bg-gradient-to-r from-primary/5 to-accent/5 px-4 py-3 border-b border-border/30">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                      <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                      <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                      <div className="ml-4 text-sm text-muted-foreground font-medium">senteloans.com/dashboard</div>
                    </div>
                  </div>
                  <div className="relative">
                    <Image
                      src="https://res.cloudinary.com/hatari/image/upload/v1756727956/sente-loans/screenshots/senteloans-dashboard-preview_rwjy9y.png"
                      alt="Sente Loan Dashboard Preview"
                      width={1200}
                      height={800}
                      className="w-full h-auto"
                      priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/10 to-transparent pointer-events-none"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-8">
            <p className="text-muted-foreground">Trusted by SACCOs, MFIs, and Money Lenders across Uganda</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center opacity-60">
            <div className="text-center">
              <div className="font-semibold">Kampala SACCO</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">Opportunity MFI</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">Quick Cash Uganda</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">Jinja Financial</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-4">
              Everything you need to manage your financial institution
            </h2>
            <p className="text-xl text-muted-foreground text-pretty max-w-2xl mx-auto">
              From client onboarding to loan disbursement, we've got you covered with powerful tools designed for
              Ugandan SACCOs, MFIs, and Money Lenders.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <Users className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Client Management</CardTitle>
                <CardDescription>
                  Complete client lifecycle management with KYC verification, profile tracking, and automated onboarding
                  for members, clients, and borrowers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Digital KYC verification
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Client profile management
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Automated notifications
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CreditCard className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Loan Management</CardTitle>
                <CardDescription>
                  Streamlined loan processing from application to repayment with automated calculations and tracking for
                  all institution types.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Automated loan calculations
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Repayment scheduling
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Default risk management
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <PiggyBank className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Savings & Shares</CardTitle>
                <CardDescription>
                  Configurable savings account management with multiple account types and transaction tracking. Optional
                  for Money Lenders, essential for SACCOs and MFIs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Multiple account types
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Real-time balance tracking
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Interest calculations
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <BarChart3 className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Reports & Analytics</CardTitle>
                <CardDescription>
                  Powerful reporting tools with real-time analytics and customizable dashboards for data-driven
                  decisions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Real-time dashboards
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Custom report generation
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Export capabilities
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Security & Compliance</CardTitle>
                <CardDescription>
                  Bank-grade security with role-based access control and compliance with Ugandan financial regulations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Role-based access
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Data encryption
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Audit trails
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Clock className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Mobile-First Design</CardTitle>
                <CardDescription>
                  Optimized for mobile devices with offline capabilities, perfect for field operations across Uganda's
                  diverse financial institutions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Mobile responsive
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Offline capabilities
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Fast loading
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-4">What our customers say</h2>
            <p className="text-xl text-muted-foreground text-pretty">
              Join hundreds of satisfied financial institutions across Uganda
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4">
                  "Sente Loan has transformed how we manage our 3,000+ clients. The automated loan processing alone
                  saves us 20 hours per week."
                </p>
                <div className="flex items-center">
                  <div>
                    <div className="font-semibold">Sarah Nakato</div>
                    <div className="text-sm text-muted-foreground">Manager, Kampala SACCO</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4">
                  "The mobile-first design is perfect for our field operations. Our loan officers can now process
                  applications on-site."
                </p>
                <div className="flex items-center">
                  <div>
                    <div className="font-semibold">James Okello</div>
                    <div className="text-sm text-muted-foreground">CEO, Northern Uganda MFI</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4">
                  "The configurable interface adapts perfectly to our money lending operations. We've improved our
                  collection efficiency by 15%."
                </p>
                <div className="flex items-center">
                  <div>
                    <div className="font-semibold">Grace Namuli</div>
                    <div className="text-sm text-muted-foreground">Manager, Quick Cash Uganda</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-4">Simple, transparent pricing</h2>
            <p className="text-xl text-muted-foreground text-pretty">
              Choose the plan that fits your institution's size and needs
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Starter</CardTitle>
                <CardDescription>Perfect for small institutions</CardDescription>
                <div className="text-3xl font-bold">
                  UGX 200K<span className="text-lg font-normal text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Up to 500 clients
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Basic reporting
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Email support
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Mobile access
                  </li>
                </ul>
                <Button className="w-full">Chat with us</Button>
              </CardContent>
            </Card>

            <Card className="border-primary">
              <CardHeader>
                <Badge className="w-fit mb-2">Most Popular</Badge>
                <CardTitle>Professional</CardTitle>
                <CardDescription>For growing institutions</CardDescription>
                <div className="text-3xl font-bold">
                  UGX 500K<span className="text-lg font-normal text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Up to 2,000 clients
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Advanced analytics
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Priority support
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    API access
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Custom reports
                  </li>
                </ul>
                <Button className="w-full">Chat with us</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enterprise</CardTitle>
                <CardDescription>For large institutions</CardDescription>
                <div className="text-3xl font-bold">
                  Custom<span className="text-lg font-normal text-muted-foreground"> pricing</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Unlimited clients
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    White-label solution
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Dedicated support
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    Custom integrations
                  </li>
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-success mr-2" />
                    On-premise deployment
                  </li>
                </ul>
                <Button variant="outline" className="w-full bg-transparent">
                  Contact Sales
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-4">Frequently asked questions</h2>
            <p className="text-xl text-muted-foreground text-pretty">Everything you need to know about Sente Loan</p>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How quickly can we get started?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  You can start your free trial immediately. Our onboarding team will help you migrate your data and
                  train your staff within 2-3 weeks.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Is my data secure?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Yes, we use bank-grade security with 256-bit encryption, regular backups, and comply with Ugandan data
                  protection regulations.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I import my existing member data?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Our team will help you migrate all your existing member, loan, and savings data from spreadsheets or
                  other systems.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Do you provide training?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Yes, we provide comprehensive training for your staff, including video tutorials, documentation, and
                  live training sessions.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-4">
              Ready to transform your financial institution?
            </h2>
            <p className="text-xl text-muted-foreground text-pretty mb-8">
              Join hundreds of SACCOs, MFIs, and Money Lenders across Uganda who trust Sente Loan to manage their
              operations efficiently.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="https://wa.me/256787624334?text=Hello%20David%2C%20I%20would%20like%20to%20know%20more%20about%20Senteloans"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="lg" className="text-lg px-8 py-3">
                  Chat with us <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <a href="https://forms.gle/vpTQvomDsQPNSqPy6" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="text-lg px-8 py-3 bg-transparent">
                  Schedule Demo
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-12 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Image
                  src="https://res.cloudinary.com/hatari/image/upload/v1756391632/sente-loans/logos/sente-loans-symbol-logo_jyteeu.png"
                  alt="Sente Loan"
                  width={24}
                  height={24}
                  className="h-6 w-auto"
                />
                <h3 className="text-lg font-semibold">Sente Loan</h3>
              </div>
              <p className="text-muted-foreground text-sm mb-4">
                The complete digital platform for Ugandan SACCOs, MFIs, and Money Lenders.
              </p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center space-x-2">
                  <MapPin className="h-4 w-4" />
                  <span>Plot 19, Kavuma Drive, Nsasa estate, Kampala Uganda</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4" />
                  <span>+256787624334</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span>contact@senteloans.com</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#features" className="hover:text-foreground">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-foreground">
                    Pricing
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/contact" className="hover:text-foreground">
                    Contact Us
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/about" className="hover:text-foreground">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground">
                    Privacy
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2024 Sente Loan. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
