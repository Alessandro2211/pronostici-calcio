# Pronostici Calcio Europa

Pagina web (installabile come app) con i pronostici 1X2, le doppie, gli Over/Under e la schedina per Serie A, Premier League, LaLiga, Bundesliga, Ligue 1, Eredivisie e Primeira Liga.
Tieni premuto 3 secondi il simbolo di un campionato per vedere la schedina.

Le percentuali sono stime statistiche e non garantiscono nessun esito.

## Come si aggiorna da sola

Ogni 5 minuti un workflow di GitHub Actions (`.github/workflows/aggiorna.yml`) scarica i risultati di ieri, oggi e domani con una sola richiesta (`data/live.json`). Il calcolo completo qui sotto si rinnova ogni 30 minuti:

1. scarica da [football-data.org](https://www.football-data.org) classifiche, calendario e marcatori (`scripts/update.mjs`);
2. sceglie come giornata corrente la prima con almeno una partita ancora da giocare, quindi passa alla successiva appena finisce l'ultima partita;
3. pubblica la pagina e i dati su GitHub Pages.

La pagina rilegge i dati all'apertura e ogni 10 minuti, e i risultati in diretta ogni minuto. Voti dei giocatori e voto medio di squadra (Sofascore, 10 ottobre 2026) restano quelli incorporati nella pagina.

## Risultati in diretta

Sotto ogni partita iniziata compaiono il risultato (In diretta, Intervallo o Finale) e il confronto con il pronostico: segno, doppia e Over/Under, con ✓ centrata, ✗ sbagliata oppure «in linea» o «fuori linea» finché la partita è in corso. Sopra l'elenco c'è il riepilogo della giornata, e la schedina mostra l'esito di ogni pick. Il piano gratuito di football-data.org può ritardare i punteggi di qualche minuto.

## Attivazione (una sola volta)

1. Crea la chiave gratuita su football-data.org (Register → la chiave arriva per email).
2. Su GitHub: **Settings → Secrets and variables → Actions → New repository secret**, nome `FOOTBALL_DATA_KEY`, valore la chiave.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Actions → Aggiorna e pubblica → Run workflow**.
5. L'indirizzo della pagina è `https://<tuo-utente>.github.io/pronostici-calcio/`.

Nota: GitHub sospende i workflow programmati dopo 60 giorni senza attività nel repository. Se succede, riattivali dalla scheda Actions.

## APK

Con la pagina online, vai su [pwabuilder.com](https://www.pwabuilder.com), incolla l'indirizzo della pagina, scegli **Package for stores → Android** e scarica l'APK. Icona e manifest sono già inclusi (`site/icons`, `site/manifest.webmanifest`).

## Struttura

- `site/index.html`: pagina e modello di previsione
- `site/names.js`: abbina i nomi delle squadre dell'API a quelli della pagina
- `site/sw.js`, `site/manifest.webmanifest`, `site/icons/`: installazione come app
- `scripts/update.mjs`: scarica i dati
