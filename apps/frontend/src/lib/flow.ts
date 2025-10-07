import * as fcl from "@onflow/fcl"

// Configure FCL for Flow blockchain
fcl.config({
  "accessNode.api": process.env.NEXT_PUBLIC_FLOW_ACCESS_NODE || "https://rest-testnet.onflow.org",
  "discovery.wallet": process.env.NEXT_PUBLIC_FLOW_WALLET_DISCOVERY || "https://fcl-discovery.onflow.org/testnet/authn",
  "0xProfile": process.env.NEXT_PUBLIC_FLOW_PROFILE_CONTRACT || "0xba1132bc08f82fe2",
  "app.detail.title": "FastBreak",
  "app.detail.icon": "https://fastbreak.app/icon.png",
  "service.OpenID.scopes": "email email_verified name zoneinfo"
})

export { fcl }

export interface FlowUser {
  addr: string | null | undefined
  cid: string | null
  expiresAt: number | null
  f_type: string
  f_vsn: string
  loggedIn: boolean
  services: any[]
}

export const getCurrentUser = (): Promise<FlowUser> => {
  return fcl.currentUser.snapshot() as Promise<FlowUser>
}

export const authenticate = () => {
  return fcl.authenticate()
}

export const unauthenticate = () => {
  return fcl.unauthenticate()
}

export const subscribeToUser = (callback: (user: FlowUser) => void) => {
  return fcl.currentUser.subscribe((user: any) => callback(user as FlowUser))
}