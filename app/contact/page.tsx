"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Mail, Phone, MapPin, Clock, Handshake, Calendar, DollarSign, HelpCircle } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useState } from "react"
import { sendContactEmail } from "@/lib/send-contact-email"

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitMessage(null)

    const formData = new FormData(e.currentTarget)
    const data = {
      name: `${formData.get("firstName")} ${formData.get("lastName")}`.trim(),
      email: formData.get("email") as string,
      company: formData.get("organization") as string,
      subject: `Contact Form: ${formData.get("inquiry")}`,
      message: formData.get("message") as string,
      inquiryType: formData.get("inquiry") as string,
    }

    try {
      const result = await sendContactEmail(data)
      setSubmitMessage({
        type: result.success ? "success" : "error",
        message: result.message,
      })

      if (result.success) {
        e.currentTarget.reset()
      }
    } catch (error) {
      setSubmitMessage({
        type: "error",
        message: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

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
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h1 className="text-4xl sm:text-5xl font-bold text-balance mb-6">Contact Us</h1>
            <p className="text-xl text-muted-foreground text-pretty max-w-3xl mx-auto">
              We're here to help your SACCO succeed. Get in touch with our team for support, demos, or partnership
              opportunities.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <Card>
              <CardHeader>
                <CardTitle>Send us a message</CardTitle>
              </CardHeader>
              <CardContent>
                {submitMessage && (
                  <div
                    className={`mb-6 p-4 rounded-md ${
                      submitMessage.type === "success"
                        ? "bg-green-50 text-green-800 border border-green-200"
                        : "bg-red-50 text-red-800 border border-red-200"
                    }`}
                  >
                    {submitMessage.message}
                  </div>
                )}

                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" name="firstName" placeholder="Enter your first name" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" name="lastName" placeholder="Enter your last name" required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" name="email" type="email" placeholder="Enter your email address" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" name="phone" type="tel" placeholder="Enter your phone number" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="organization">SACCO/Organization Name</Label>
                    <Input id="organization" name="organization" placeholder="Enter your SACCO or organization name" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="inquiry">Type of Inquiry</Label>
                    <Select name="inquiry" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select inquiry type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="partnership">Partnership & Collaboration</SelectItem>
                        <SelectItem value="demo">Schedule Demo & Training</SelectItem>
                        <SelectItem value="pricing">Pricing & Packages</SelectItem>
                        <SelectItem value="support">Technical Support</SelectItem>
                        <SelectItem value="general">General Inquiry</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      name="message"
                      placeholder="Tell us more about your inquiry..."
                      className="min-h-[120px]"
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Sending..." : "Send Message"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <div className="space-y-8">
              {/* Contact Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Get in Touch</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <Mail className="h-6 w-6 text-primary mt-1" />
                    <div>
                      <h3 className="font-semibold">Email</h3>
                      <p className="text-muted-foreground">support@senteloans.com</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <Phone className="h-6 w-6 text-primary mt-1" />
                    <div>
                      <h3 className="font-semibold">Phone</h3>
                      <p className="text-muted-foreground">256787624334</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <MapPin className="h-6 w-6 text-primary mt-1" />
                    <div>
                      <h3 className="font-semibold">Location</h3>
                      <p className="text-muted-foreground">
                        Kavuma drive, Plot 19
                        <br />
                        New Nsasa estate
                        <br />
                        Kampala, Uganda
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <Clock className="h-6 w-6 text-primary mt-1" />
                    <div>
                      <h3 className="font-semibold">Response Time</h3>
                      <p className="text-muted-foreground">
                        We strive to respond to all inquiries within 24-48 hours during business days.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* How We Can Help */}
              <Card>
                <CardHeader>
                  <CardTitle>How We Can Help</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Handshake className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <h4 className="font-semibold text-sm">Partnership & Collaboration Opportunities</h4>
                      <p className="text-muted-foreground text-sm">
                        Explore strategic partnerships and collaboration opportunities to expand our reach and impact.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Calendar className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <h4 className="font-semibold text-sm">Scheduling Demos & Training</h4>
                      <p className="text-muted-foreground text-sm">
                        Book personalized demos and comprehensive training sessions for your SACCO team.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <DollarSign className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <h4 className="font-semibold text-sm">Pricing & Various Packages</h4>
                      <p className="text-muted-foreground text-sm">
                        Get detailed information about our pricing plans and find the perfect package for your needs.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <HelpCircle className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <h4 className="font-semibold text-sm">General Inquiries</h4>
                      <p className="text-muted-foreground text-sm">
                        Any questions about our platform, features, or how SenteLoans can benefit your SACCO.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
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
            &copy; 2025 Sente Loan. All rights reserved. We're here to help your SACCO succeed.
          </p>
        </div>
      </footer>
    </div>
  )
}
