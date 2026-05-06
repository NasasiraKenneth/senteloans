declare module "bwip-js" {
  export type BwipJsToBufferOptions = {
    bcid: string
    text: string
    scale?: number
    height?: number
    includetext?: boolean
    textxalign?: "left" | "center" | "right"
    [key: string]: unknown
  }

  const bwipjs: {
    toBuffer(options: BwipJsToBufferOptions): Promise<Buffer>
  }

  export default bwipjs
}
