/** Fetch pools with underlying assets metadata */
export const TRADE_QUERY = `
  query GetTradeData {
    pools {
      id
      tokenSymbol
      strikeAsset { id symbol decimals }
      collateralAsset { id symbol decimals }
      underlyingAssets {
        asset { id symbol decimals }
        enabled
      }
    }
  }
`

/** Fetch available underlying assets with pool config */
export const UNDERLYING_ASSETS_QUERY = `
  query GetUnderlyingAssets {
    pools(first: 1) {
      id
      collateralAsset { id symbol }
      strikeAsset { id symbol }
      underlyingAssets {
        asset { id symbol decimals }
        enabled
      }
    }
  }
`

/** Fetch oTokens (options) filtered by parameters */
export const OTOKENS_QUERY = `
  query GetOTokens(
    $underlyingAsset: String!
    $collateralAsset: String!
    $isPut: Boolean!
    $expiryTimestamp: BigInt!
    $strikePriceGt: BigInt
    $strikePriceLt: BigInt
    $orderDirection: OrderDirection!
  ) {
    otokens(
      first: 1000
      where: {
        underlyingAsset: $underlyingAsset
        collateralAsset: $collateralAsset
        isPut: $isPut
        expiryTimestamp_gt: $expiryTimestamp
        strikePrice_gt: $strikePriceGt
        strikePrice_lt: $strikePriceLt
      }
      orderBy: strikePrice
      orderDirection: $orderDirection
    ) {
      id
      strikePrice
      expiryTimestamp
      isPut
      underlyingAsset { id }
      collateralAsset { id }
    }
  }
`

/** Fetch a specific oToken by parameters */
export const OTOKEN_QUERY = `
  query GetOToken(
    $underlyingAsset: String!
    $collateralAsset: String!
    $strikePrice: BigInt!
    $isPut: Boolean!
    $expiryTimestamp: BigInt!
  ) {
    otokens(
      where: {
        underlyingAsset: $underlyingAsset
        collateralAsset: $collateralAsset
        strikePrice: $strikePrice
        isPut: $isPut
        expiryTimestamp: $expiryTimestamp
      }
      first: 1
    ) {
      id
    }
  }
`

/** Fetch user's vaults to find existing vault for a series */
export const ACCOUNT_VAULTS_QUERY = `
  query GetAccountVaults($owner: ID!) {
    account(id: $owner) {
      id
      vaults {
        vaultId
        otokens {
          token { id }
        }
      }
    }
  }
`
