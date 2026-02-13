"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, Camera, Upload, CheckCircle, Clock, AlertCircle, FileText, Image, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getSession } from "@/lib/session"

const kycRequirements = [
  {
    id: "nationalId",
    title: "National ID",
    description: "Upload a clear photo of both sides of your National ID",
    required: true,
    status: "pending",
    files: [],
  },
  {
    id: "proofOfAddress",
    title: "Proof of Address",
    description: "Upload utility bill, bank statement, or rental agreement (not older than 3 months)",
    required: true,
    status: "not-uploaded",
    files: [],
  },
  {
    id: "passport",
    title: "Passport Photo",
    description: "Upload a recent passport-size photograph",
    required: false,
    status: "not-uploaded",
    files: [],
  },
  {
    id: "incomeProof",
    title: "Proof of Income",
    description: "Upload salary slip, business license, or tax returns",
    required: false,
    status: "verified",
    files: [],
  },
]

export default function KYCPage() {
  const [session, setSession] = useState(null)
  const [documents, setDocuments] = useState(kycRequirements)
  const [isLoading, setIsLoading] = useState(true)
  const [uploadingDoc, setUploadingDoc] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const sessionData = getSession()
    if (!sessionData) {
      router.push("/client-login")
      return
    }
    setSession(sessionData)
    setIsLoading(false)
  }, [router])

  const calculateProgress = () => {
    const totalRequired = documents.filter((doc) => doc.required).length
    const completedRequired = documents.filter((doc) => doc.required && doc.status === "verified").length
    return Math.round((completedRequired / totalRequired) * 100)
  }

  const handleFileUpload = async (docId, file) => {
    setUploadingDoc(docId)

    // Mock upload process
    setTimeout(() => {
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === docId
            ? {
                ...doc,
                status: "pending",
                files: [
                  ...doc.files,
                  {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    uploadDate: new Date().toISOString(),
                  },
                ],
              }
            : doc,
        ),
      )
      setUploadingDoc(null)
    }, 2000)
  }

  const handleCameraCapture = (docId) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.capture = "environment" // Use back camera
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        handleFileUpload(docId, file)
      }
    }
    input.click()
  }

  const handleFileSelect = (docId) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*,.pdf"
    input.multiple = true
    input.onchange = (e) => {
      const files = Array.from(e.target.files)
      files.forEach((file) => handleFileUpload(docId, file))
    }
    input.click()
  }

  const removeFile = (docId, fileIndex) => {
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === docId
          ? {
              ...doc,
              files: doc.files.filter((_, index) => index !== fileIndex),
              status: doc.files.length === 1 ? "not-uploaded" : doc.status,
            }
          : doc,
      ),
    )
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "pending":
        return <Clock className="h-4 w-4 text-orange-600" />
      default:
        return <AlertCircle className="h-4 w-4 text-red-600" />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case "verified":
        return "default"
      case "pending":
        return "outline"
      default:
        return "secondary"
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading KYC information...</p>
        </div>
      </div>
    )
  }

  const progress = calculateProgress()
  const requiredDocs = documents.filter((doc) => doc.required)
  const completedRequired = requiredDocs.filter((doc) => doc.status === "verified").length

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center space-x-3">
          <Link href="/client-portal/profile">
            <Button size="sm" variant="ghost" className="text-primary-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">KYC Verification</h1>
            <p className="text-sm opacity-90">Complete your identity verification</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Progress Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification Progress</CardTitle>
            <CardDescription>
              {progress === 100
                ? "Your verification is complete!"
                : `${completedRequired} of ${requiredDocs.length} required documents verified`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Required Documents</span>
                <span>{progress}% Complete</span>
              </div>
              <Progress value={progress} className="h-3" />
              {progress === 100 && (
                <div className="flex items-center space-x-2 text-green-600 text-sm">
                  <CheckCircle className="h-4 w-4" />
                  <span>All required documents verified</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Document Upload Cards */}
        <div className="space-y-4">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className={`${
                doc.status === "verified"
                  ? "border-green-200 bg-green-50"
                  : doc.status === "pending"
                    ? "border-orange-200 bg-orange-50"
                    : "border-border"
              }`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CardTitle className="text-base">{doc.title}</CardTitle>
                    {doc.required && (
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </div>
                  <Badge variant={getStatusColor(doc.status)} className="flex items-center space-x-1">
                    {getStatusIcon(doc.status)}
                    <span className="capitalize">{doc.status.replace("-", " ")}</span>
                  </Badge>
                </div>
                <CardDescription>{doc.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Uploaded Files */}
                {doc.files.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Uploaded Files:</h4>
                    {doc.files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div className="flex items-center space-x-2">
                          {file.type.startsWith("image/") ? (
                            <Image className="h-4 w-4" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          <div>
                            <p className="text-sm font-medium">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024 / 1024).toFixed(2)} MB •{" "}
                              {new Date(file.uploadDate).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFile(doc.id, index)}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload Actions */}
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCameraCapture(doc.id)}
                    disabled={uploadingDoc === doc.id}
                    className="flex-1 bg-transparent"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {uploadingDoc === doc.id ? "Uploading..." : "Take Photo"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleFileSelect(doc.id)}
                    disabled={uploadingDoc === doc.id}
                    className="flex-1 bg-transparent"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingDoc === doc.id ? "Uploading..." : "Upload File"}
                  </Button>
                </div>

                {/* Upload Progress */}
                {uploadingDoc === doc.id && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Uploading...</span>
                      <span>Processing</span>
                    </div>
                    <Progress value={75} className="h-2" />
                  </div>
                )}

                {/* Status Messages */}
                {doc.status === "pending" && (
                  <div className="flex items-center space-x-2 text-orange-600 text-sm">
                    <Clock className="h-4 w-4" />
                    <span>Document under review (1-2 business days)</span>
                  </div>
                )}
                {doc.status === "verified" && (
                  <div className="flex items-center space-x-2 text-green-600 text-sm">
                    <CheckCircle className="h-4 w-4" />
                    <span>Document verified successfully</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Help Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Tips</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-2 text-muted-foreground">
              <li>• Ensure documents are clear and all text is readable</li>
              <li>• Take photos in good lighting conditions</li>
              <li>• Accepted formats: JPG, PNG, PDF (max 5MB per file)</li>
              <li>• Documents should not be older than 3 months (where applicable)</li>
              <li>• Contact support if you need help with document requirements</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
