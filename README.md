# Pronostici Calcio Europa

Pagina web (installabile come app) con i pronostici 1X2, le doppie, gli Over/Under e la schedina per Serie A, Premier League, LaLiga, Bundesliga, Ligue 1, Eredivisie e Primeira Liga.
Tieni premuto 3 secondi il simbolo di un campionato per vedere la schedina.

Le percentuali sono stime statistiche e non garantiscono nessun esito.

## Come si aggiorna da sola (senza chiavi né registrazioni)

Ogni 5 minuti un workflow di GitHub Actions (`.github/workflows/aggiorna.yml`) esegue `scripts/update.mjs`, che:

1. a ogni esecuzione legge da ESPN (API pubblica, nessuna chiave) i risultati di ieri, oggi e domani di ogni campionato;
2. ogni 30 minuti, o appena finisce l'ultima partita di una giornata, rilegge il calendario da 4 giorni fa a 8 giorni avanti e le classifiche. ESPN accetta una sola data per richiesta, quindi lo script la interroga giorno per giorno;
3. sceglie come giornata corrente la prima con almeno una partita ancora da giocare;
4. pubblica la pagina e i dati su GitHub Pages.

La pagina rilegge i dati all'apertura e ogni 10 minuti, e i risultati in diretta ogni minuto.

Limiti: l'API di ESPN non è ufficiale e può cambiare senza preavviso. Non fornisce i marcatori e il rendimento in casa/fuori. Voti dei giocatori, marcatori e voto medio di squadra (Sofascore, 10 ottobre 2026) restano quelli incorporati nella pagina. Se ESPN restituisce una classifica vuota, la pagina tiene quella del 10 ottobre e lo scrive nella nota del campionato.

## Risultati in diretta

Sotto ogni partita iniziata compaiono il risultato (In diretta con il minuto, Intervallo o Finale) e il confronto con il pronostico: segno, doppia e Over/Under, con ✓ centrata, ✗ sbagliata oppure «in linea» o «fuori linea» finché la partita è in corso. Sopra l'elenco c'è il riepilogo della giornata, e la schedina mostra l'esito di ogni pick.

## Attivazione (una sola volta)

1. Il repository deve essere pubblico (con un account gratuito GitHub Pages non funziona su quelli privati).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → Aggiorna e pubblica → Run workflow**.
4. L'indirizzo della pagina è `https://<tuo-utente>.github.io/pronostici-calcio/`.

Nota: GitHub sospende i workflow programmati dopo 60 giorni senza attività nel repository. Se succede, riattivali dalla scheda Actions.

## APK

Con la pagina online, vai su [pwabuilder.com](https://www.pwabuilder.com), incolla l'indirizzo della pagina, scegli **Package for stores → Android** e scarica l'APK. Icona e manifest sono già inclusi (`site/icons`, `site/manifest.webmanifest`).

## Struttura

- `site/index.html`: pagina e modello di previsione
- `site/names.js`: abbina i nomi delle squadre dell'API a quelli della pagina
- `site/sw.js`, `site/manifest.webmanifest`, `site/icons/`: installazione come app
- `scripts/update.mjs`: scarica i dati da ESPN
