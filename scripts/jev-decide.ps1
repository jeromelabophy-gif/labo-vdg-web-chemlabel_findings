param(
  [Parameter(Mandatory=$false)][string]$State,
  [Parameter(Mandatory=$false)][string]$Questions,
  [Parameter(Mandatory=$false)][string]$StateFile,
  [Parameter(Mandatory=$false)][string]$QuestionsFile,
  [string]$Model = "typesafe/jev-1.13"
)
# Jev via OpenRouter Decisions API - wrapper for opencode sub-agent
# Usage:
#   jev-decide.ps1 -State '{"message":"hello"}' -Questions '{"is_urgent":{"type":"noul","instructions":"Is urgent?"}}'
#   jev-decide.ps1 -StateFile state.json -QuestionsFile questions.json
#   echo '{"state":{...},"questions":{...}}' | jev-decide.ps1

$ErrorActionPreference = "Stop"

# Load API key from opencode auth
$authPath = "$env:USERPROFILE\.local\share\opencode\auth.json"
if (!(Test-Path $authPath)) { Write-Error "auth.json not found at $authPath"; exit 1 }
$auth = Get-Content $authPath -Raw | ConvertFrom-Json
$apiKey = $auth.openrouter.key
if (!$apiKey) { Write-Error "openrouter key not found in auth.json"; exit 1 }

# Resolve state/questions
if ($StateFile) { $State = Get-Content $StateFile -Raw }
if ($QuestionsFile) { $Questions = Get-Content $QuestionsFile -Raw }

# If piped JSON with state+questions
if (!$State -and !$Questions) {
  $piped = $null
  if ([Console]::IsInputRedirected) { $piped = [Console]::In.ReadToEnd() }
  if ($piped -and $piped.Trim()) {
    try {
      $obj = $piped | ConvertFrom-Json
      if ($obj.state) { $State = ($obj.state | ConvertTo-Json -Depth 20 -Compress) }
      if ($obj.questions) { $Questions = ($obj.questions | ConvertTo-Json -Depth 20 -Compress) }
      if (!$State -and !$Questions) { $State = $piped }
    } catch { $State = $piped }
  }
}

if (!$State) { Write-Error "Missing -State or piped input. Provide JSON state."; exit 1 }

# Parse to objects
try { $stateObj = $State | ConvertFrom-Json } catch { $stateObj = $State } # keep as string if not JSON
try { $questionsObj = $null; if ($Questions) { $questionsObj = $Questions | ConvertFrom-Json } } catch { Write-Error "Invalid Questions JSON: $_"; exit 1 }

if (!$questionsObj) {
  # Default demo question if none provided
  $questionsObj = @{
    is_urgent = @{
      type = "noul"
      instructions = "Does this state convey urgency?"
      true = "Urgent"
      false = "Not urgent"
    }
  } | ConvertTo-Json -Depth 10 | ConvertFrom-Json
}

# Build payload - Jev expects {model, state, questions}
$payload = @{
  model = $Model
  state = $stateObj
  questions = $questionsObj
} | ConvertTo-Json -Depth 20 -Compress

Write-Verbose "→ Jev $Model via openrouter.ai/api/alpha/decisions" -Verbose:$false
# Write-Host disabled for JSON-only stdout (Node callJev expects pure JSON)

$headers = @{
  "Authorization" = "Bearer $apiKey"
  "Content-Type" = "application/json"
  "HTTP-Referer" = "http://localhost"
  "X-Title" = "opencode-jev-subagent"
}

try {
  $resp = Invoke-RestMethod -Uri "https://openrouter.ai/api/alpha/decisions" -Method Post -Headers $headers -Body $payload -TimeoutSec 30
  $resp | ConvertTo-Json -Depth 20
} catch {
  Write-Error "Jev API error: $($_.Exception.Message)"
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
  exit 1
}
