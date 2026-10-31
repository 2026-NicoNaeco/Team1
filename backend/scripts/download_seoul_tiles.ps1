# 서울 도로망 OSM 을 3x3 조각으로 나눠 받는다. 한 번에 받으면 요청이 너무 커서 서버가 받아 주지 않는다.
# 이미 받은 조각은 건너뛰므로, 중간에 멈추면 같은 명령을 다시 실행하면 된다.
# 조각(tile_1.osm ~ tile_9.osm)은 지금 폴더에 받는다. 합치기·변환은 backend/README.md 참고.
#   powershell -ExecutionPolicy Bypass -File scripts\download_seoul_tiles.ps1
$d = (Get-Location).Path
$servers = @(
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter"
)
# 서울시 경계를 덮는 범위 (남, 서, 북, 동)
$south = 37.41; $west = 126.76; $north = 37.72; $east = 127.19
$rows = 3; $cols = 3
$roads = '^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service)$'

function Test-Tile($path) {
    if (-not (Test-Path $path)) { return $false }
    # 끝부분이 </osm> 으로 끝나고, 중간에 끊긴 표시(remark)가 없어야 완전한 파일이다.
    # 서울 땅이 거의 없는 가장자리 조각은 도로가 없어 빈 파일로 오는데, 그것도 정상 응답이다
    $tail = Get-Content $path -Tail 5 -Encoding UTF8 | Out-String
    return ($tail -match '</osm>') -and ($tail -notmatch '<remark')
}

$total = $rows * $cols
for ($r = 0; $r -lt $rows; $r++) {
    for ($c = 0; $c -lt $cols; $c++) {
        $i = $r * $cols + $c + 1
        $out = "$d\tile_$i.osm"
        if (Test-Tile $out) { Write-Host "[$i/$total] 이미 받음, 건너뜀"; continue }

        $s = [math]::Round($south + ($north - $south) * $r / $rows, 4)
        $n = [math]::Round($south + ($north - $south) * ($r + 1) / $rows, 4)
        $w = [math]::Round($west + ($east - $west) * $c / $cols, 4)
        $e = [math]::Round($west + ($east - $west) * ($c + 1) / $cols, 4)
        $query = @"
[out:xml][timeout:300][maxsize:536870912];
area["ISO3166-2"="KR-11"]["admin_level"="4"]->.seoul;
way["highway"~"$roads"](area.seoul)($s,$w,$n,$e)->.roads;
(.roads; node(w.roads); relation(bw.roads)["type"="restriction"];);
out body;
"@
        $qfile = "$d\tile_$i.overpassql"
        [IO.File]::WriteAllText($qfile, $query, (New-Object System.Text.UTF8Encoding($false)))

        $ok = $false
        $wait = 20
        for ($try = 1; $try -le 4 -and -not $ok; $try++) {
            foreach ($srv in $servers) {
                Write-Host "[$i/$total] $try 회차 $srv ..."
                curl.exe -sS -A "easy-route-api (Team1)" --data-urlencode "data@$qfile" $srv -o $out
                if (Test-Tile $out) { $ok = $true; break }
                Write-Host "  실패, 다음 서버로"
            }
            if (-not $ok) { Write-Host "  $wait 초 기다렸다가 다시 시도"; Start-Sleep $wait; $wait *= 2 }
        }
        if ($ok) {
            Write-Host ("[$i/$total] 성공 {0:N1} MB" -f ((Get-Item $out).Length / 1MB))
        } else {
            Write-Host "[$i/$total] 받지 못했습니다. 잠시 뒤 같은 명령을 다시 실행하면 이 조각부터 이어서 받습니다."
            exit 1
        }
        Start-Sleep 5  # 공용 서버에 연달아 부담을 주지 않게 조금 쉰다
    }
}
Write-Host "전체 $total 조각 모두 받았습니다."
