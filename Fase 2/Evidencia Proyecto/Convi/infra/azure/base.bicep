targetScope = 'resourceGroup'

// Brazil South es la intersección de las políticas de Duoc y Azure for Students.
param location string = 'brazilsouth'

var tags = { proyecto: 'CONVI', entorno: 'pruebas' }

// ACR cobra por día aunque las aplicaciones estén detenidas; ver AZURE.md.
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'convi${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
  }
}

resource environment 'Microsoft.App/managedEnvironments@2026-07-01' = {
  name: 'cae-convi-estandar-pruebas'
  location: location
  tags: tags
  properties: {
    // Express no admite nuestro dominio; declarar el modo evita depender del valor predeterminado.
    environmentMode: 'WorkloadProfiles'
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    // También cifra el salto entre el proxy de Azure y los contenedores.
    peerTrafficConfiguration: { encryption: { enabled: true } }
    // shortcut: solo logs en vivo en este entorno estudiantil; añadir retención antes de operar con datos reales.
    appLogsConfiguration: {}
  }
}

resource imageIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-convi-imagenes'
  location: location
  tags: tags
}

resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-convi-github'
  location: location
  tags: tags
}

resource federation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deployIdentity
  name: 'github-convi-pruebas'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    // GitHub incorpora IDs inmutables; deben coincidir exactamente con su token.
    subject: 'repo:CvmiloM@135039204/Capstone@1349101566:ref:refs/heads/main'
    audiences: ['api://AzureADTokenExchange']
  }
}

resource imagePull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, imageIdentity.id, 'AcrPull')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: imageIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// La automatización gestiona este grupo, sin conceder roles ni acceder a otra suscripción.
resource deployContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deployIdentity.id, 'Contributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
    principalId: deployIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource imagePush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, deployIdentity.id, 'AcrPush')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')
    principalId: deployIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output registryName string = registry.name
output registryServer string = registry.properties.loginServer
output environmentName string = environment.name
output imageIdentityId string = imageIdentity.id
output githubClientId string = deployIdentity.properties.clientId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
