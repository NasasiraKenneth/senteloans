"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { X, Search, Loader2 } from "lucide-react"

interface Guarantor {
  id: string
  full_name: string
  phone_number: string
  member_number: string
}

interface GuarantorSearchProps {
  selectedGuarantors: Guarantor[]
  onGuarantorsChange: (guarantors: Guarantor[]) => void
  minGuarantors?: number
  maxGuarantors?: number
}

export function GuarantorSearch({
  selectedGuarantors,
  onGuarantorsChange,
  minGuarantors = 1,
  maxGuarantors = 3,
}: GuarantorSearchProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Guarantor[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Search for guarantors
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(`/api/client/search-guarantors?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        
        if (data.ok && data.guarantors) {
          // Filter out already selected guarantors
          const selectedIds = selectedGuarantors.map(g => g.id)
          const filtered = data.guarantors.filter((g: Guarantor) => !selectedIds.includes(g.id))
          setSearchResults(filtered)
          setShowResults(true)
        }
      } catch (error) {
        console.error("Guarantor search error:", error)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, selectedGuarantors])

  const handleSelectGuarantor = (guarantor: Guarantor) => {
    if (selectedGuarantors.length >= maxGuarantors) {
      return
    }
    
    onGuarantorsChange([...selectedGuarantors, guarantor])
    setSearchQuery("")
    setSearchResults([])
    setShowResults(false)
  }

  const handleRemoveGuarantor = (guarantorId: string) => {
    onGuarantorsChange(selectedGuarantors.filter(g => g.id !== guarantorId))
  }

  const canAddMore = selectedGuarantors.length < maxGuarantors

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="guarantor-search">
          Search Guarantors {minGuarantors > 0 && `(Minimum ${minGuarantors} required)`}
        </Label>
        <div className="relative" ref={containerRef}>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="guarantor-search"
              type="text"
              placeholder="Search by name or phone number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
              disabled={!canAddMore}
              className="pl-9"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <Card className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto">
              <div className="p-2">
                {searchResults.map((guarantor) => (
                  <Button
                    key={guarantor.id}
                    variant="ghost"
                    className="w-full justify-start text-left h-auto py-2"
                    onClick={() => handleSelectGuarantor(guarantor)}
                  >
                    <div className="w-full">
                      <div className="font-medium">{guarantor.full_name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <span>{guarantor.phone_number}</span>
                        {guarantor.member_number && (
                          <>
                            <span>•</span>
                            <span>Member #{guarantor.member_number}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </Card>
          )}

          {showResults && searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
            <Card className="absolute z-10 mt-1 w-full">
              <div className="p-4 text-sm text-muted-foreground text-center">
                No members found matching "{searchQuery}"
              </div>
            </Card>
          )}
        </div>

        {!canAddMore && (
          <p className="text-xs text-muted-foreground mt-1">
            Maximum {maxGuarantors} guarantors allowed
          </p>
        )}
      </div>

      {/* Selected Guarantors */}
      {selectedGuarantors.length > 0 && (
        <div className="space-y-2">
          <Label>Selected Guarantors ({selectedGuarantors.length})</Label>
          <div className="space-y-2">
            {selectedGuarantors.map((guarantor, index) => (
              <Card key={guarantor.id} className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{guarantor.full_name}</span>
                      <Badge variant="outline" className="text-xs">
                        Guarantor {index + 1}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                      <span>{guarantor.phone_number}</span>
                      {guarantor.member_number && (
                        <>
                          <span>•</span>
                          <span>Member #{guarantor.member_number}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveGuarantor(guarantor.id)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Validation message */}
      {minGuarantors > 0 && selectedGuarantors.length < minGuarantors && (
        <p className="text-sm text-destructive">
          Please select at least {minGuarantors} guarantor{minGuarantors > 1 ? "s" : ""} to continue
        </p>
      )}
    </div>
  )
}
