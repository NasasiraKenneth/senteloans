import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, Users, TrendingUp, Shield } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
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
            <div className="flex items-center space-x-4">
              <Link href="/login">
                <Button variant="ghost">Login</Button>
              </Link>
              <Link href="/register">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h1 className="text-4xl sm:text-5xl font-bold text-balance mb-6">About Us</h1>
            <p className="text-xl text-muted-foreground text-pretty max-w-3xl mx-auto">
              At <strong>SenteLoans</strong>, we believe in the power of community. Our mission is simple yet
              transformative:{" "}
              <strong>
                to empower Ugandan Saccos and credit cooperatives with an intuitive web application that fosters
                community, drives financial growth, and streamlines operations for collective upliftment.
              </strong>
            </p>
          </div>

          <div className="prose prose-lg max-w-none">
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              We understand that Saccos and cooperatives are more than financial institutions—they are circles of trust,
              unity, and shared purpose. They bring people together to save, lend, and grow, not just as individuals,
              but as communities. SenteLoans is built to strengthen this foundation, ensuring that every member's
              contribution translates into progress for all.
            </p>
          </div>
        </div>
      </section>

      {/* Ubuntu Philosophy Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-6">Our Inspiration: Ubuntu in Action</h2>
            <p className="text-xl text-muted-foreground text-pretty">
              The heart of SenteLoans beats with the <strong>Ubuntu philosophy</strong>—"I am because we are." This
              African value of interconnectedness and mutual support is woven into everything we do.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <Card>
              <CardContent className="pt-6 text-center">
                <Users className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Community & Interconnectedness</h3>
                <p className="text-muted-foreground text-sm">
                  The circle of figures symbolizes the unity and trust at the core of every Sacco.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <TrendingUp className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Collective Growth & Upliftment</h3>
                <p className="text-muted-foreground text-sm">
                  The upward sprouting motif represents financial growth and community empowerment through
                  collaboration.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Trust & Modernity</h3>
                <p className="text-muted-foreground text-sm">
                  Clean, modern design mirrors our commitment to reliable technology for today and the future.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="text-center">
            <p className="text-muted-foreground italic">
              Our logo, the <strong>Ubuntu Upliftment Circle</strong>, reflects this vision of unity, growth, and trust.
            </p>
          </div>
        </div>
      </section>

      {/* Why We Exist Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-6">Why We Exist</h2>
          </div>

          <div className="prose prose-lg max-w-none">
            <p className="text-muted-foreground text-lg leading-relaxed mb-6">
              In Uganda, Saccos and credit cooperatives remain vital to financial inclusion and local economic growth.
              Yet many still struggle with manual processes, inefficiencies, and limited tools for managing members,
              savings, and loans.
            </p>

            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              SenteLoans bridges that gap—bringing technology designed specifically for Ugandan communities. With
              SenteLoans, Saccos can:
            </p>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="text-center p-6 rounded-lg bg-muted/50">
                <h3 className="font-semibold text-primary mb-2">Simplify Operations</h3>
                <p className="text-sm text-muted-foreground">with digital tools</p>
              </div>
              <div className="text-center p-6 rounded-lg bg-muted/50">
                <h3 className="font-semibold text-primary mb-2">Empower Members</h3>
                <p className="text-sm text-muted-foreground">with transparency and trust</p>
              </div>
              <div className="text-center p-6 rounded-lg bg-muted/50">
                <h3 className="font-semibold text-primary mb-2">Drive Growth</h3>
                <p className="text-sm text-muted-foreground">and uplift entire communities</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Promise Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-primary/5">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-balance mb-6">Our Promise</h2>
          <p className="text-xl text-muted-foreground text-pretty mb-8 max-w-3xl mx-auto">
            We are more than a software provider—we are partners in community progress. Every feature of SenteLoans is
            designed with one purpose:{" "}
            <strong>
              to make collective upliftment easier, stronger, and sustainable for Ugandan Saccos and credit
              cooperatives.
            </strong>
          </p>
          <div className="text-2xl font-bold text-primary mb-8">Together, we rise.</div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="text-lg px-8 py-3">
                Join Our Community
              </Button>
            </Link>
            <Link href="/">
              <Button size="lg" variant="outline" className="text-lg px-8 py-3 bg-transparent">
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Image
              src="https://res.cloudinary.com/hatari/image/upload/v1756391632/sente-loans/logos/sente-loans-symbol-logo_jyteeu.png"
              alt="Sente Loan"
              width={24}
              height={24}
              className="h-6 w-auto"
            />
            <h3 className="text-lg font-semibold">Sente Loan</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; 2024 Sente Loan. All rights reserved. Empowering Ugandan communities through technology.
          </p>
        </div>
      </footer>
    </div>
  )
}
