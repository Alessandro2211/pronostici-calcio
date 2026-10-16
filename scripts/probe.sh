#!/usr/bin/env bash
# Prova di raggiungibilità delle fonti dati: codice HTTP, permesso CORS dal browser, dimensione e inizio del contenuto.
OUT=probe-result.md
ORIGIN="https://alessandro2211.github.io"
echo "# Prova fonti dati ($(date -u +%FT%TZ))" > $OUT
probe() {
  local name="$1" url="$2"; shift 2
  local h b code
  h=$(mktemp); b=$(mktemp)
  code=$(curl -sS -L -m 30 -A "Mozilla/5.0 (probe)" -H "Origin: $ORIGIN" "$@" -D "$h" -o "$b" -w "%{http_code}" "$url" 2>&1) || true
  echo "" >> $OUT
  echo "## $name" >> $OUT
  echo "- URL: $url" >> $OUT
  echo "- HTTP: $code" >> $OUT
  echo "- CORS (access-control-allow-origin): $(grep -i '^access-control-allow-origin' "$h" | tail -1 | tr -d '\r' || true)" >> $OUT
  echo "- content-type: $(grep -i '^content-type' "$h" | tail -1 | tr -d '\r')" >> $OUT
  echo "- dimensione: $(wc -c < "$b") byte" >> $OUT
  echo '```' >> $OUT
  head -c "${SNIP:-400}" "$b" | tr -d '\r' >> $OUT
  echo "" >> $OUT
  echo '```' >> $OUT
}
probe "ESPN scoreboard Serie A (oggi)" "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates=$(date -u +%Y%m%d)"
SNIP=700 probe "football-data.co.uk Serie A 2026/27" "https://www.football-data.co.uk/mmz4281/2627/I1.csv"
SNIP=300 probe "football-data.co.uk Eredivisie 2026/27" "https://www.football-data.co.uk/mmz4281/2627/N1.csv"
SNIP=300 probe "football-data.co.uk Primeira Liga 2026/27" "https://www.football-data.co.uk/mmz4281/2627/P1.csv"
SNIP=300 probe "football-data.co.uk Premier League 2026/27" "https://www.football-data.co.uk/mmz4281/2627/E0.csv"
SNIP=300 probe "openfootball Serie A 2026-27" "https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/it.1.json"
SNIP=300 probe "openfootball Serie A 2025-26" "https://raw.githubusercontent.com/openfootball/football.json/master/2025-26/it.1.json"
SNIP=300 probe "openfootball Eredivisie 2026-27" "https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/nl.1.json"
SNIP=300 probe "openfootball Primeira 2026-27" "https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/pt.1.json"
SNIP=500 probe "TheSportsDB prossimi Serie A (chiave pubblica 3)" "https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4332"
SNIP=500 probe "TheSportsDB ultimi Serie A (chiave pubblica 3)" "https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=4332"
SNIP=500 probe "OpenLigaDB Bundesliga 2026" "https://api.openligadb.de/getmatchdata/bl1/2026"
SNIP=500 probe "Sofascore partite in diretta" "https://api.sofascore.com/api/v1/sport/football/events/live"
SNIP=300 probe "Sofascore programma di oggi" "https://api.sofascore.com/api/v1/sport/football/scheduled-events/$(date -u +%F)"
SNIP=300 probe "FotMob partite di oggi" "https://www.fotmob.com/api/matches?date=$(date -u +%Y%m%d)"
SNIP=200 probe "Understat Serie A 2026 (xG)" "https://understat.com/league/Serie_A/2026"
SNIP=200 probe "FBref Serie A" "https://fbref.com/en/comps/11/Serie-A-Stats"
echo "" >> $OUT
echo "Fine." >> $OUT
