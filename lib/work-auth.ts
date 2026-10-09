import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { jwt } from 'better-auth/plugins/jwt'
import { mcp } from '@better-auth/mcp'
import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { LibsqlDialect } from '@libsql/kysely-libsql'
import { isWorkOwner, workAuthConfig, workScopes } from './work-auth-config'
import { workAuthSchema } from './work-auth-schema'
import db from './db'

export function createWorkAuth() {
  const config = workAuthConfig()
  if (!config) throw new Error('Work login configuration is incomplete')
  return betterAuth({
    appName: 'LifeWallet',
    baseURL: config.origin,
    basePath: '/api/auth',
    secret: config.secret,
    trustedOrigins: [config.origin],
    database: { dialect: new LibsqlDialect({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }), type: 'sqlite' },
    user: { modelName: 'work_auth_user' },
    session: { modelName: 'work_auth_session', expiresIn: 60 * 60, cookieCache: { enabled: false } },
    account: { modelName: 'work_auth_account', accountLinking: { enabled: false }, encryptOAuthTokens: true },
    verification: { modelName: 'work_auth_verification' },
    advanced: { cookiePrefix: 'lifewallet-work' },
    rateLimit: { enabled: true, storage: 'database', modelName: 'work_auth_rate_limit', window: 60, max: 60 },
    disabledPaths: ['/token'],
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        prompt: 'select_account',
        mapProfileToUser(profile) {
          if (!isWorkOwner(profile.email, profile.email_verified)) throw new APIError('FORBIDDEN', { message: '허용되지 않은 계정입니다' })
          return { email: profile.email.trim().toLowerCase(), emailVerified: true }
        },
      },
    },
    databaseHooks: {
      user: { create: { before: async user => {
        if (!isWorkOwner(user.email, user.emailVerified)) throw new APIError('FORBIDDEN', { message: '허용되지 않은 계정입니다' })
        return { data: user }
      } } },
      session: { create: { before: async (session, context) => {
        const user = await context?.context.internalAdapter.findUserById(session.userId)
        if (!user || !isWorkOwner(user.email, user.emailVerified)) throw new APIError('FORBIDDEN', { message: '허용되지 않은 계정입니다' })
        return { data: session }
      } } },
    },
    plugins: [
      jwt({ disableSettingJwtHeader: true, schema: { jwks: { modelName: 'work_auth_jwks' } } }),
      mcp({
        loginPage: '/mcp-connect/login', consentPage: '/mcp-connect/consent', resource: config.resource,
        scopes: workScopes,
        grantTypes: ['authorization_code', 'refresh_token'],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        accessTokenExpiresIn: 15 * 60,
        refreshTokenExpiresIn: 30 * 24 * 60 * 60,
        codeExpiresIn: 120,
        customAccessTokenClaims: async ({ user }) => {
          if (!user || !isWorkOwner(user.email, user.emailVerified)) throw new APIError('FORBIDDEN', { message: '허용되지 않은 계정입니다' })
          return { email: user.email, email_verified: true }
        },
        schema: {
          oauthClient: { modelName: 'work_auth_oauth_client' },
          oauthResource: { modelName: 'work_auth_oauth_resource' },
          oauthClientResource: { modelName: 'work_auth_oauth_client_resource' },
          oauthAccessToken: { modelName: 'work_auth_oauth_access_token' },
          oauthRefreshToken: { modelName: 'work_auth_oauth_refresh_token' },
          oauthConsent: { modelName: 'work_auth_oauth_consent' },
          oauthClientAssertion: { modelName: 'work_auth_oauth_client_assertion' },
        },
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
    ],
  })
}

let instance: ReturnType<typeof createWorkAuth> | undefined
let initialized: Promise<void> | undefined
export async function getWorkAuth() {
  if (!workAuthConfig()) return null
  instance ??= createWorkAuth()
  initialized ??= db.executeMultiple(workAuthSchema).catch(error => { initialized = undefined; throw error })
  await initialized
  return instance
}
