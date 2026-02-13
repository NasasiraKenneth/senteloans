import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Shield, Lock, Eye, FileText, Users, Clock } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export default function PrivacyPolicyPage() {
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
            <h1 className="text-4xl sm:text-5xl font-bold text-balance mb-6">Privacy Policy</h1>
            <p className="text-xl text-muted-foreground text-pretty max-w-3xl mx-auto">
              Your privacy and data security are fundamental to our mission of empowering Ugandan Saccos and credit
              cooperatives.
            </p>
            <div className="text-sm text-muted-foreground mt-4">Last updated: January 29, 2025</div>
          </div>
        </div>
      </section>

      {/* Privacy Overview Cards */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <Card>
              <CardContent className="pt-6 text-center">
                <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Bank-Grade Security</h3>
                <p className="text-muted-foreground text-sm">
                  We use 256-bit encryption and industry-standard security measures to protect your financial data.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <Lock className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Data Minimization</h3>
                <p className="text-muted-foreground text-sm">
                  We only collect data necessary for SACCO operations and member management.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <Eye className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Full Transparency</h3>
                <p className="text-muted-foreground text-sm">
                  You have complete visibility and control over how your data is used and stored.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-4xl">
          <div className="prose prose-lg max-w-none">
            {/* Introduction */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Introduction
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  SenteLoans ("we," "our," or "us") is committed to protecting the privacy and security of personal and
                  financial information collected through our SACCO management platform. This Privacy Policy explains
                  how we collect, use, disclose, and safeguard information when you use our services, in compliance with
                  Ugandan data protection laws and international best practices.
                </p>
              </CardContent>
            </Card>

            {/* Information We Collect */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Information We Collect
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-primary mb-2">Member Personal Information</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                    <li>Full names, date of birth, and national identification numbers</li>
                    <li>Contact information (phone numbers, email addresses, physical addresses)</li>
                    <li>Employment details and income information</li>
                    <li>Next of kin and emergency contact details</li>
                    <li>KYC documentation and verification records</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-primary mb-2">Financial Information</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                    <li>Savings account balances and transaction histories</li>
                    <li>Loan applications, approvals, and repayment records</li>
                    <li>Share contributions and dividend information</li>
                    <li>Payment methods and banking details</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-primary mb-2">Technical Information</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                    <li>Device information and IP addresses</li>
                    <li>Login credentials and access logs</li>
                    <li>Usage patterns and system interactions</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* How We Use Information */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>How We Use Your Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground text-sm">
                      <strong>SACCO Operations:</strong> Managing member accounts, processing loans, tracking savings,
                      and generating reports
                    </p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground text-sm">
                      <strong>Compliance:</strong> Meeting regulatory requirements and conducting KYC verification
                    </p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground text-sm">
                      <strong>Communication:</strong> Sending account updates, payment reminders, and important notices
                    </p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground text-sm">
                      <strong>Security:</strong> Preventing fraud, unauthorized access, and ensuring system integrity
                    </p>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-muted-foreground text-sm">
                      <strong>Analytics:</strong> Improving our services and generating anonymized insights for SACCO
                      management
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Data Security */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Data Security & Protection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  We implement comprehensive security measures to protect your information:
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-primary">Technical Safeguards</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                      <li>256-bit SSL/TLS encryption</li>
                      <li>Encrypted data storage</li>
                      <li>Regular security audits</li>
                      <li>Secure cloud infrastructure</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-primary">Access Controls</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                      <li>Role-based access permissions</li>
                      <li>Multi-factor authentication</li>
                      <li>Regular access reviews</li>
                      <li>Audit trails and monitoring</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Data Sharing */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Information Sharing & Disclosure</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  We do not sell, trade, or rent your personal information. We may share information only in these
                  limited circumstances:
                </p>
                <div className="space-y-3">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold text-primary mb-2">With Your SACCO</h4>
                    <p className="text-muted-foreground text-sm">
                      Your SACCO administrators have access to member information necessary for operations and
                      compliance.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold text-primary mb-2">Legal Requirements</h4>
                    <p className="text-muted-foreground text-sm">
                      When required by Ugandan law, court orders, or regulatory authorities.
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold text-primary mb-2">Service Providers</h4>
                    <p className="text-muted-foreground text-sm">
                      With trusted third-party providers who assist in delivering our services, under strict
                      confidentiality agreements.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Data Retention */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Data Retention
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  We retain your information for as long as necessary to provide services and comply with legal
                  obligations:
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
                    <span className="font-medium">Active member records</span>
                    <span className="text-muted-foreground text-sm">Duration of membership + 7 years</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
                    <span className="font-medium">Loan records</span>
                    <span className="text-muted-foreground text-sm">7 years after loan closure</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
                    <span className="font-medium">Transaction records</span>
                    <span className="text-muted-foreground text-sm">7 years from transaction date</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
                    <span className="font-medium">System logs</span>
                    <span className="text-muted-foreground text-sm">2 years</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Your Rights */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Your Privacy Rights</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  As a data subject, you have the following rights regarding your personal information:
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-success rounded-full mt-2 flex-shrink-0"></div>
                      <div>
                        <h4 className="font-semibold text-sm">Access</h4>
                        <p className="text-muted-foreground text-xs">Request copies of your personal data</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-success rounded-full mt-2 flex-shrink-0"></div>
                      <div>
                        <h4 className="font-semibold text-sm">Correction</h4>
                        <p className="text-muted-foreground text-xs">Update inaccurate information</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-success rounded-full mt-2 flex-shrink-0"></div>
                      <div>
                        <h4 className="font-semibold text-sm">Deletion</h4>
                        <p className="text-muted-foreground text-xs">
                          Request removal of your data (subject to legal requirements)
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-success rounded-full mt-2 flex-shrink-0"></div>
                      <div>
                        <h4 className="font-semibold text-sm">Portability</h4>
                        <p className="text-muted-foreground text-xs">Receive your data in a structured format</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-success rounded-full mt-2 flex-shrink-0"></div>
                      <div>
                        <h4 className="font-semibold text-sm">Objection</h4>
                        <p className="text-muted-foreground text-xs">Object to certain processing activities</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-success rounded-full mt-2 flex-shrink-0"></div>
                      <div>
                        <h4 className="font-semibold text-sm">Complaint</h4>
                        <p className="text-muted-foreground text-xs">Lodge complaints with supervisory authorities</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Contact Us</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  For privacy-related questions, concerns, or to exercise your rights, please contact us:
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Email:</span>
                    <span className="text-muted-foreground">privacy@senteloans.com</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Phone:</span>
                    <span className="text-muted-foreground">+256 (0) 700 123 456</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-medium">Address:</span>
                    <span className="text-muted-foreground">
                      SenteLoans Privacy Office
                      <br />
                      Kampala, Uganda
                    </span>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm mt-4">
                  We will respond to your privacy requests within 30 days of receipt.
                </p>
              </CardContent>
            </Card>

            {/* Updates */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Policy Updates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  We may update this Privacy Policy periodically to reflect changes in our practices or legal
                  requirements. We will notify you of significant changes through our platform or by email. Your
                  continued use of our services after such modifications constitutes acceptance of the updated policy.
                </p>
              </CardContent>
            </Card>
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
            &copy; 2025 Sente Loan. All rights reserved. Your privacy is our priority.
          </p>
        </div>
      </footer>
    </div>
  )
}
