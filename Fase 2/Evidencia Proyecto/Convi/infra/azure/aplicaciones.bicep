targetScope = 'resourceGroup'

param location string = 'brazilsouth'
param registryName string
param apiImage string
param webImage string
param supabaseUrl string
param supabasePublishableKey string
@secure()
param supabaseSecretKey string
@secure()
param supabaseDbUrl string
@secure()
param redisUrl string
param iaEmbeddingsUrl string = ''
@secure()
param iaEmbeddingsToken string = ''
// Conserva certificados y dominios existentes al repetir la instalación inicial.
param webCustomDomains array = []

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = { name: registryName }
resource environment 'Microsoft.App/managedEnvironments@2026-07-01' existing = { name: 'cae-convi-estandar-pruebas' }
resource imageIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = { name: 'id-convi-imagenes' }

var identity = {
  type: 'UserAssigned'
  userAssignedIdentities: { '${imageIdentity.id}': {} }
}
var registries = [{ server: registry.properties.loginServer, identity: imageIdentity.id }]
var tags = { proyecto: 'CONVI', entorno: 'pruebas' }

resource api 'Microsoft.App/containerApps@2025-07-01' = {
  name: 'ca-convi-api-estandar'
  location: location
  tags: tags
  identity: identity
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: false, targetPort: 3001, transport: 'http', allowInsecure: false }
      registries: registries
      secrets: concat([
        { name: 'supabase-secret', value: supabaseSecretKey }
        { name: 'supabase-db', value: supabaseDbUrl }
        { name: 'redis-url', value: redisUrl }
      ], empty(iaEmbeddingsToken) ? [] : [{ name: 'ia-embeddings-token', value: iaEmbeddingsToken }])
    }
    template: {
      containers: [{
        name: 'api'
        image: apiImage
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        env: concat([
          { name: 'SUPABASE_URL', value: supabaseUrl }
          { name: 'SUPABASE_PUBLISHABLE_KEY', value: supabasePublishableKey }
          { name: 'SUPABASE_SECRET_KEY', secretRef: 'supabase-secret' }
          { name: 'SUPABASE_DB_URL', secretRef: 'supabase-db' }
          { name: 'REDIS_URL', secretRef: 'redis-url' }
        ], empty(iaEmbeddingsUrl) ? [] : [{ name: 'IA_EMBEDDINGS_URL', value: iaEmbeddingsUrl }],
          empty(iaEmbeddingsToken) ? [] : [{ name: 'IA_EMBEDDINGS_TOKEN', secretRef: 'ia-embeddings-token' }])
        probes: [
          { type: 'Startup', tcpSocket: { port: 3001 }, periodSeconds: 2, failureThreshold: 60 }
          { type: 'Readiness', httpGet: { path: '/', port: 3001 }, periodSeconds: 10, timeoutSeconds: 5 }
        ]
      }]
      // PB-027: el trabajador debe continuar aunque no haya visitas.
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

resource web 'Microsoft.App/containerApps@2025-07-01' = {
  name: 'ca-convi-web-estandar'
  location: location
  tags: tags
  identity: identity
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
        customDomains: webCustomDomains
      }
      registries: registries
    }
    template: {
      containers: [{
        name: 'web'
        image: webImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          // FQDN interno HTTPS, no dirección pública ni localhost del contenedor.
          { name: 'API_URL', value: 'https://${api.properties.configuration.ingress.fqdn}' }
          { name: 'SUPABASE_URL', value: supabaseUrl }
        ]
        probes: [
          { type: 'Startup', tcpSocket: { port: 3000 }, periodSeconds: 2, failureThreshold: 60 }
          { type: 'Readiness', httpGet: { path: '/login', port: 3000 }, periodSeconds: 10, timeoutSeconds: 5 }
        ]
      }]
      // Evitar el arranque en frío al volver a CONVI o enviar un archivo.
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
output apiUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
