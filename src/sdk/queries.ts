/**
 * Hypersurface SDK GraphQL Queries
 *
 * Subgraph queries for fetching on-chain data.
 * These are plain strings compatible with graphql-request.
 */

/** Fetch pools with underlying assets metadata */
export const TRADE_QUERY = `
  query GetTradeData {
    pools {
      id
      tokenSymbol
      strikeAsset {
        id
        symbol
        name
        decimals
      }
      collateralAsset {
        id
        symbol
        name
        decimals
      }
      underlyingAssets {
        asset {
          id
          symbol
          name
          decimals
        }
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
      collateralAsset {
        id
        symbol
        name
        decimals
      }
      strikeAsset {
        id
        symbol
        name
        decimals
      }
      underlyingAssets {
        id
        asset {
          id
          symbol
          name
          decimals
        }
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
      decimals
      expiryTimestamp
      isPut
      underlyingAsset {
        id
        symbol
        name
        decimals
      }
      collateralAsset {
        id
        symbol
        name
        decimals
      }
      strikeAsset {
        id
        symbol
        name
        decimals
      }
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
      strikePrice
      decimals
      expiryTimestamp
      isPut
      underlyingAsset {
        id
        symbol
        name
        decimals
      }
      collateralAsset {
        id
        symbol
        name
        decimals
      }
      strikeAsset {
        id
        symbol
        name
        decimals
      }
    }
  }
`

/** Fetch user's vaults to find existing vault for a series */
export const ACCOUNT_VAULTS_QUERY = `
  query GetAccountVaults($owner: ID!) {
    account(id: $owner) {
      id
      vaults {
        id
        vaultId
        otokens {
          token {
            id
          }
        }
      }
    }
  }
`
