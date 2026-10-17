targetScope = 'resourceGroup'

param location string = 'brazilsouth'
param redisName string = 'redis-convi-${uniqueString(resourceGroup().id)}'

resource redis 'Microsoft.Cache/redisEnterprise@2025-07-01' = {
  name: redisName
  location: location
  tags: { proyecto: 'CONVI', entorno: 'pruebas' }
  sku: { name: 'Balanced_B0' }
  properties: {
    highAvailability: 'Disabled'
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    encryption: {}
  }
}

resource database 'Microsoft.Cache/redisEnterprise/databases@2025-07-01' = {
  parent: redis
  name: 'default'
  properties: {
    accessKeysAuthentication: 'Enabled'
    clientProtocol: 'Encrypted'
    clusteringPolicy: 'NoCluster'
    evictionPolicy: 'NoEviction'
    port: 10000
  }
}

output redisName string = redis.name
output redisHost string = redis.properties.hostName
output redisPort int = database.properties.port
