import React from "react"
import { Image, Text, View } from "@react-pdf/renderer"

interface InvoiceQrCodeProps {
  dataUrl: string
  size?: number
  label?: string
}

export default function InvoiceQrCode({ dataUrl, size = 70, label = "Invoice QR" }: InvoiceQrCodeProps) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Image src={dataUrl} style={{ width: size, height: size }} />
    </View>
  )
}
