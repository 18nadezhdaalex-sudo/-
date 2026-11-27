# Сборка данных дашборда из PRD.md
# Создаёт пять JSON-файлов модели в data/ и бандл data/data.js
# (бандл нужен, чтобы index.html открывался двойным кликом, без веб-сервера).
#
# Запуск:  powershell -ExecutionPolicy Bypass -File scripts\build-data.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$prdPath = Join-Path $root 'PRD.md'
$dataDir = Join-Path $root 'data'
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

$lines = [IO.File]::ReadAllLines($prdPath, [Text.Encoding]::UTF8)

function Get-Cells([string]$line) {
    $t = $line.Trim()
    $t = $t.Substring(1, $t.Length - 2)
    return @($t.Split('|') | ForEach-Object { $_.Trim() })
}
function Get-Int([string]$s) {
    $c = ($s -replace '\*', '' -replace [char]0x2212, '-' -replace '[^\d\-+]', '')
    if ($c -eq '' -or $c -eq '-' -or $c -eq '+') { return 0 }
    return [int]$c
}
function Get-Pair([string]$s) {
    $p = $s -split [char]0x2192
    return @((Get-Int $p[0]), (Get-Int $p[$p.Length - 1]))
}

$departments = New-Object System.Collections.ArrayList
$deptByName = @{}
$positions = New-Object System.Collections.ArrayList
$branches = New-Object System.Collections.ArrayList
$practices = New-Object System.Collections.ArrayList
$requirements = New-Object System.Collections.ArrayList

$section = 0
$h3 = ''
$curDept = $null
$tableRow = 0

foreach ($line in $lines) {
    if ($line -match '^##\s+(\d+)\.') { $section = [int]$Matches[1]; $h3 = ''; $tableRow = 0; continue }
    if ($line -match '^###\s+(.+)$') {
        $h3 = $Matches[1].Trim(); $tableRow = 0
        if ($section -eq 7 -and $h3 -match '^(\d+\.\d+)\s+(.+?)\s+' + [char]0x2014) {
            $curDept = $deptByName[$Matches[2].Trim()]
            if ($curDept) { $curDept.code = $Matches[1] }
        }
        continue
    }
    if ($section -eq 7 -and $curDept -and $line -match '^\*Куратор:\*') {
        if ($line -match '\*Лучшая практика:\*\s*(.+?)\s*\*Основание \(РК\):\*\s*(.+)$') {
            $curDept.practice = $Matches[1].Trim()
            $curDept.legal = $Matches[2].Trim()
        }
        continue
    }
    if (-not $line.TrimStart().StartsWith('|')) { $tableRow = 0; continue }

    $tableRow++
    if ($tableRow -eq 1) { continue }                        # заголовок таблицы
    if ($line -match '^\|[\s\-:|]+\|\s*$') { continue }      # разделитель
    $c = Get-Cells $line
    if ($c[0] -like '**Итого*') { continue }

    switch ($section) {
        5 {
            $curator = ($h3 -split [char]0x2014)[0].Trim()
            $d = [ordered]@{
                id = 'd' + ($departments.Count + 1); code = ''; name = $c[0]; curator = $curator; block = $c[1]
                base = Get-Int $c[2]; auto = Get-Int $c[3]; practice = ''; legal = ''
                isBranchNetwork = ($c[1] -like '8.*')
            }
            [void]$departments.Add($d); $deptByName[$c[0]] = $d
        }
        7 {
            if ($curDept) {
                [void]$positions.Add([ordered]@{
                    deptId = $curDept.id; title = $c[0]; base = Get-Int $c[1]; auto = Get-Int $c[2]
                    basis = $c[4]; comment = $c[5]
                })
            }
        }
        8 {
            $a = Get-Pair $c[6]; $s = Get-Pair $c[7]; $t = Get-Pair $c[8]
            [void]$branches.Add([ordered]@{
                city = $c[0]; region = $c[1]; type = $c[2]
                director = Get-Int $c[3]; agentLeads = Get-Int $c[4]; bankCorp = Get-Int $c[5]
                annuityBase = $a[0]; annuityAuto = $a[1]; serviceBase = $s[0]; serviceAuto = $s[1]
                totalBase = $t[0]; totalAuto = $t[1]
            })
        }
        10 {
            $scope = if ($h3 -like '*Казахстан*') { 'kz' } else { 'world' }
            [void]$practices.Add([ordered]@{ scope = $scope; area = $c[0]; title = $c[1]; description = $c[2]; effect = $c[3] })
        }
        11 {
            [void]$requirements.Add([ordered]@{ area = $c[0]; act = $c[1]; units = $c[2]; what = $c[3] })
        }
    }
}

# Проверки целостности: сумма должностей = численности подразделения
function Get-Sum($items, [string]$key) { $s = 0; foreach ($i in $items) { $s += $i[$key] }; return $s }
$errors = @()
foreach ($d in $departments) {
    $ps = @($positions | Where-Object { $_.deptId -eq $d.id })
    $sb = Get-Sum $ps base
    $sa = Get-Sum $ps auto
    if ($sb -ne $d.base -or $sa -ne $d.auto) { $errors += "$($d.name): должности $sb/$sa, подразделение $($d.base)/$($d.auto)" }
}
$bb = Get-Sum $branches totalBase
$ba = Get-Sum $branches totalAuto
$net = $departments | Where-Object { $_.isBranchNetwork }
if ($net -and ($bb -ne $net.base -or $ba -ne $net.auto)) { $errors += "Филиалы: $bb/$ba против $($net.base)/$($net.auto)" }

$utf8 = New-Object Text.UTF8Encoding $false
function Save-Json($obj, [string]$name) {
    $json = ConvertTo-Json -InputObject @($obj) -Depth 5
    [IO.File]::WriteAllText((Join-Path $dataDir $name), $json, $utf8)
    return $json
}
$jd = Save-Json $departments 'departments.json'
$jp = Save-Json $positions 'positions.json'
$jb = Save-Json $branches 'branches.json'
$jr = Save-Json $practices 'practices.json'
$jq = Save-Json $requirements 'requirements.json'

$bundle = "// Сгенерировано scripts/build-data.ps1 из PRD.md — не редактировать вручную`n" +
    "window.ORG_DATA = {`n  departments: $jd,`n  positions: $jp,`n  branches: $jb,`n  practices: $jr,`n  requirements: $jq`n};`n"
[IO.File]::WriteAllText((Join-Path $dataDir 'data.js'), $bundle, $utf8)

$tb = Get-Sum $departments base
$ta = Get-Sum $departments auto
Write-Host ("Подразделений: {0}, должностей: {1}, филиалов: {2}, практик: {3}, требований: {4}" -f `
    $departments.Count, $positions.Count, $branches.Count, $practices.Count, $requirements.Count)
Write-Host ("Штат: база {0}, автоматизация {1}" -f $tb, $ta)
if ($errors.Count) { Write-Warning ("Расхождения:`n" + ($errors -join "`n")); exit 1 }
Write-Host 'Проверки пройдены.'
