"use server"

interface ContactFormData {
  name: string
  email: string
  company: string
  subject: string
  message: string
  inquiryType: string
}

export async function sendContactEmail(data: ContactFormData) {
  try {
    const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
    const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN
    const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'info@senteloans.com'

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.error("Mailgun API key or domain not configured")
      return { success: false, message: "Email service not configured" }
    }

    // Create email body with all the contact details
    const emailBody = `
      New Contact Form Submission:
      
      Name: ${data.name}
      Email: ${data.email}
      Company: ${data.company || "Not provided"}
      Inquiry Type: ${data.inquiryType || "Not specified"}
      
      Message:
      ${data.message}
      
      This is an automated notification from SenteLoans
    `

    // Construct the form data as URL encoded parameters
    const formParams = new URLSearchParams()
    formParams.append("from", `${data.name} <${data.email}>`)
    formParams.append("to", CONTACT_EMAIL)
    formParams.append("subject", data.subject || "New Contact Form Submission")
    formParams.append("text", emailBody)
    // Add reply-to header so replies go directly to the sender
    formParams.append("h:Reply-To", data.email)

    // Make API request to Mailgun
    const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formParams.toString(),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error("Mailgun API error:", errorData)
      return { success: false, message: "Failed to send your message. Please try again later." }
    }

    return { success: true, message: "Your message has been sent successfully!" }
  } catch (error) {
    console.error("Error sending contact email:", error)
    return { success: false, message: "An error occurred while sending your message. Please try again later." }
  }
}
