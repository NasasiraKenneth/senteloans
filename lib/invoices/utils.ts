export const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
}

// Utility function to convert numbers to words
export const numberToWords = (num: number): string => {
  const units = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  
  const numToWord = (num: number): string => {
    if (num < 20) return units[num];
    const digit = num % 10;
    if (num < 100)
      return (
        tens[Math.floor(num / 10)] + (digit ? ' ' + units[digit] : '')
      );
    if (num < 1000)
      return (
        units[Math.floor(num / 100)] +
        ' hundred' +
        (num % 100 ? ' and ' + numToWord(num % 100) : '')
      );
    if (num < 1000000)
      return (
        numToWord(Math.floor(num / 1000)) +
        ' thousand' +
        (num % 1000 ? ' ' + numToWord(num % 1000) : '')
      );
    return (
      numToWord(Math.floor(num / 1000000)) +
      ' million' +
      (num % 1000000 ? ' ' + numToWord(num % 1000000) : '')
    );
  };

  const shillings = Math.floor(num);

  const result = numToWord(shillings) + ' Ugandan shillings only';

  return result.charAt(0).toUpperCase() + result.slice(1);
};

export function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}