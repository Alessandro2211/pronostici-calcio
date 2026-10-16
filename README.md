# Pronostici Calcio Europa

Pagina web (installabile come app) con i pronostici 1X2, le doppie, gli Over/Under e la schedina per Serie A, Premier League, LaLiga, Bundesliga, Ligue 1, Eredivisie e Primeira Liga.
La schedina si apre dal pulsante «Schedina» di ogni campionato, oppure tenendo premuto 3 secondi il simbolo del campionato.

Le percentuali sono stime statistiche e non garantiscono nessun esito.

## Come si aggiorna da sola (senza chiavi né registrazioni)

Ogni 5 minuti un workflow di GitHub Actions (`.github/workflows/aggiorna.yml`) esegue `scripts/update.mjs`, che:

1. a ogni esecuzione legge da ESPN (API pubblica, nessuna chiave) i risultati di ieri, oggi e domani di ogni campionato;
2. ogni 30 minuti, o appena finisce l'ultima partita di una giornata, rilegge il calendario da 4 giorni fa a 8 giorni avanti e le classifiche. ESPN accetta una sola data per richiesta, quindi lo script la interroga giorno per giorno;
3. sceglie come giornata corrente la prima con almeno una partita ancora da giocare;
4. pubblica la pagina e i dati su GitHub Pages.

La pagina rilegge i dati all'apertura e ogni 10 minuti, e i risultati in diretta ogni minuto.

I marcatori arrivano dal servizio "leaders" di ESPN (primi 20 per campionato); i nomi dei giocatori vengono letti una volta e conservati in `dati.json`.

Limiti: l'API di ESPN non è ufficiale e può cambiare senza preavviso. Non fornisce il rendimento in casa/fuori. Voti dei giocatori e voto medio di squadra (Sofascore, 10 ottobre 2026) restano quelli incorporati nella pagina. Se ESPN restituisce una classifica vuota, la pagina tiene quella del 10 ottobre e lo scrive nella nota del campionato.

## Impostazioni

L'ingranaggio in alto a destra apre le impostazioni: tema (sistema, chiaro, scuro) e visualizzazione dei campionati (quadrati con la bandiera o nomi in etichette arrotondate). Le scelte restano salvate nel browser.

## Risultati in diretta

Accanto al nome di ogni squadra compaiono i gol; sotto, lo stato (Primo tempo, Intervallo, Secondo tempo con il minuto, oppure Finale) e l'Over/Under favorito per ogni linea, con ✓ centrata, ✗ sbagliata oppure «in linea» o «fuori linea» finché la partita è in corso. Il riquadro del pronostico mostra se il segno è in linea con il risultato. Nella scheda Giocate le partite finite restano salvate fino a fine stagione e si filtrano per giornata. Sopra l'elenco c'è il riepilogo della giornata, e la schedina mostra l'esito di ogni pick.

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
- `desktop/`: app per Windows (Electron), apre la pagina online

## Partite giocate
La scheda **Giocate** di ogni campionato elenca tutte le partite finite della stagione, per giornata, con il risultato reale e i pronostici (segno, doppia, Over/Under 1,5 · 2,5 · 3,5). Verde con ✓ se il pronostico coincide con il risultato, rosso con ✗ se non coincide, più le percentuali di segni e doppie centrati.
Lo script salva le partite finite in `site/data/storico.json`: la prima volta legge tutta la stagione (una richiesta per giorno), poi solo gli ultimi giorni. Il pronostico di ogni partita è ricalcolato con la classifica ricostruita fino al giorno prima; non usa voti Sofascore né marcatori, che sono dati di oggi.

## App per Windows
Il flusso di lavoro **App Windows** (Actions) compila `Pronostici-Calcio-Setup.exe` su un computer Windows di GitHub e lo pubblica nelle Releases con indirizzo fisso:
`https://github.com/Alessandro2211/pronostici-calcio/releases/download/windows-latest/Pronostici-Calcio-Setup.exe`.
L'app apre la pagina online, quindi dati, tema e impostazioni sono quelli della versione web e non serve reinstallare per gli aggiornamenti. In più legge i risultati direttamente da ESPN ogni 30 secondi (ogni minuto se non ci sono partite in corso) e mostra in alto il riquadro «In diretta ora» con tutte le partite in corso di tutti i campionati. Il file `live.json` pubblicato da GitHub resta più lento: le esecuzioni programmate di GitHub Actions partono solo ogni 3-5 ore, quindi nel browser e sul telefono i risultati in diretta possono essere vecchi. Se manca la connessione mostra un avviso e riprova ogni 15 secondi. Il file non è firmato: Windows può mostrare l'avviso SmartScreen (Ulteriori informazioni, poi Esegui comunque).
Si ricompila da Actions con «Run workflow», oppure da solo quando cambia qualcosa in `desktop/`.

## Risultati in diretta nel browser
Durante le partite la pagina prova a leggere ESPN direttamente (ogni 30 secondi, solo per i campionati con partite in corso o in arrivo). Se ESPN non lo permette dal browser, la pagina usa `live.json` di GitHub e riprova dopo 30 minuti. La riga in fondo alla pagina dice quale fonte è in uso.
