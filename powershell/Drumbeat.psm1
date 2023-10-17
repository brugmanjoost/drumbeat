$script:DrumbeatUrl = $null
$script:DrumbeatAccessToken = $null
$script:DrumbeatQueue = $null

#####################################################################################################################################################
##
## Function:    Connect-Drumbeat
##
## Description: Setup the Drumbeat module by specifying the Drumbeat server url and access token. Optionally set a default queue.
##
#####################################################################################################################################################
function Connect-Drumbeat {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [string]$Url,

        [Parameter(Mandatory = $true)]
        [string]$AccessToken,

        [Parameter(Mandatory = $false)]
        [string]$Queue = $null
    )

    $script:DrumbeatUrl = $Url
    $script:DrumbeatAccessToken = $AccessToken
    $script:DrumbeatQueue = $Queue
}

#####################################################################################################################################################
##
## Function:    Connect-Drumbeat
##
## Description: Get the authorization headers required for each call to the backend.
##
#####################################################################################################################################################
function Get-DrumbeatHeaders {
    return @{
        Authorization = ("Bearer " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(($script:DrumbeatAccessToken))))
    }
}

#####################################################################################################################################################
##
## Function:    Get-DrumbeatUrl
##
## Description: 
##
#####################################################################################################################################################
function Get-DrumbeatUrl {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [string]$Queue = $null,

        [Parameter(Mandatory = $false)]
        [Nullable[int]]$Id = $null
    )

    if (!$script:DrumbeatUrl) {
        throw New-Object System.Exception("Not connected to a Drumbeat server. Use Connect-Drumbeat to connect.")
    }
    $Url = $script:DrumbeatUrl

    if ([string]::IsNullOrEmpty($Queue)) {
        $Queue = $script:DrumbeatQueue
    }
    if ([string]::IsNullOrEmpty($Queue)) {
        throw New-Object System.Exception("No queue specified and no default queue specified during Connect-Drumbeat.")
    }
    $Url = "$Url/$Queue"
    
    if ($Id -ne $null) {
        $Url = "$Url/$Id"
    }

    return $Url
}

#####################################################################################################################################################
##
## Function:    Create-DrumbeatMessage
##
## Description: 
##
#####################################################################################################################################################
function Create-DrumbeatMessage {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [string]$Queue = $null,

        [Parameter(Mandatory = $true)]
        [string]$Subject,

        [Parameter(Mandatory = $false)]
        [object]$requestBody = $null
    )

    $Url = Get-DrumbeatUrl -Queue $Queue
    $jsonBody = @{ subject = $Subject; requestBody = $requestBody } | ConvertTo-Json
    $response = Invoke-RestMethod -Headers (Get-DrumbeatHeaders) -Uri $url -Method Post -Body $jsonBody -ContentType "application/json"

    return $response.data
}

#####################################################################################################################################################
##
## Function:    Get-DrumbeatMessage
##
## Description: 
##
#####################################################################################################################################################
function Get-DrumbeatMessage {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [string]$Queue = $null,

        [Parameter(Mandatory = $false)]
        [Nullable[int]]$Id = $null,

        [Parameter(Mandatory = $false)]
        [ValidateSet('pending', 'cancelled', 'completed', 'failed')]
        [string]$Status
    )

    $Url = Get-DrumbeatUrl -Queue $Queue -Id $Id

    if ($Status) {
        if ($Id) {
            throw New-Object System.Exception("Cannot set Status if Id is set.")
        }
        $Url = "$($Url)?status=$Status"
    }

    $response = Invoke-RestMethod -Headers (Get-DrumbeatHeaders) -Uri $url -Method Get

    return $response.data
}

#####################################################################################################################################################
##
## Function:    Cancel-DrumbeatMessage
##
## Description: 
##
#####################################################################################################################################################
function Cancel-DrumbeatMessage {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [string]$Queue = $null,

        [Parameter(Mandatory = $true)]
        [int]$id
    )

    $Url = Get-DrumbeatUrl -Queue $Queue -Id $Id
    $Url = "$Url/cancel"
    $response = Invoke-RestMethod -Headers (Get-DrumbeatHeaders) -Uri $url -Method Patch

    return $response.data
}

#####################################################################################################################################################
##
## Function:    Delete-DrumbeatMessage
##
## Description: 
##
#####################################################################################################################################################
function Delete-DrumbeatMessage {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [string]$Queue = $null,

        [Parameter(Mandatory = $true)]
        [int]$id
    )

    $Url = Get-DrumbeatUrl -Queue $Queue -Id $Id
    $response = Invoke-RestMethod -Headers (Get-DrumbeatHeaders) -Uri $url -Method Delete

    return $response.data
}

#####################################################################################################################################################
##
## Function:    Respond-DrumbeatMessage
##
## Description: 
##
#####################################################################################################################################################
function Respond-DrumbeatMessage {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [string]$Queue = $null,

        [Parameter(Mandatory = $false)]
        [int]$Id,

        [Parameter(Mandatory = $false)]
        [ValidateSet('completed', 'failed')]
        [string]$Status,

        [Parameter(Mandatory = $false)]
        [object]$responseBody = $null
    )

    $Url = Get-DrumbeatUrl -Queue $Queue -Id $Id
    $Url = "$Url/postback"
    $jsonBody = @{ status = $status; responseBody = $responseBody } | ConvertTo-Json
    $response = Invoke-RestMethod -Headers (Get-DrumbeatHeaders) -Uri $url -Method Patch -Body $jsonBody -ContentType "application/json"

    return $response.data
}

#####################################################################################################################################################
##
## Exports
##
#####################################################################################################################################################
Export-ModuleMember -Function Connect-Drumbeat, Create-DrumbeatMessage, Get-DrumbeatMessage, Cancel-DrumbeatMessage, Delete-DrumbeatMessage, Respond-DrumbeatMessage
