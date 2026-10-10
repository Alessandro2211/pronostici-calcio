/* Abbina i nomi delle squadre dell'API (es. "FC Internazionale Milano") ai nomi usati nella pagina (es. "Inter"). */
(function (root) {
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\b(fc|cf|ac|as|afc|sc|ssc|us|ssd|fk|sv|rc|cd|ud|sl|cs|ca|rcd|ogc|vfb|vfl|tsg|fsv|bsc|calcio|club|de|da|do|di|the)\b/g, ' ')
      .replace(/\b(18|19|20)\d\d\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  // nome nella pagina -> varianti (già normalizzate) che possono comparire nell'API
  var ALIAS = {
    'Inter': ['internazionale milano', 'inter milan', 'inter'],
    'Milan': ['milan'], 'Roma': ['roma'], 'Lazio': ['lazio'], 'Napoli': ['napoli'],
    'Como': ['como'], 'Monza': ['monza'], 'Venezia': ['venezia'],
    'Man City': ['manchester city', 'man city'], 'Man Utd': ['manchester united', 'man united', 'man utd'],
    'Nott. Forest': ['nottingham forest', 'nottingham', 'nott forest'], 'Tottenham': ['tottenham hotspur', 'tottenham', 'spurs'],
    'Brighton': ['brighton and hove albion', 'brighton hove albion', 'brighton'], 'Leeds': ['leeds united', 'leeds'],
    'Hull': ['hull city', 'hull'], 'Ipswich': ['ipswich town', 'ipswich'], 'Coventry': ['coventry city', 'coventry'],
    'Newcastle': ['newcastle united', 'newcastle'], 'Crystal Palace': ['crystal palace'], 'Aston Villa': ['aston villa'],
    'Atlético': ['atletico madrid', 'atletico de madrid', 'atletico'], 'Athletic': ['athletic club', 'athletic bilbao', 'athletic'],
    'Betis': ['real betis balompie', 'real betis', 'betis'], 'Celta': ['celta de vigo', 'celta vigo', 'celta'],
    'Alavés': ['deportivo alaves', 'alaves'], 'Deportivo': ['deportivo de la coruna', 'deportivo la coruna', 'depor'],
    'Rayo Vallecano': ['rayo vallecano de madrid', 'rayo vallecano', 'rayo'], 'Racing Santander': ['racing de santander', 'racing santander', 'racing'],
    'Real Sociedad': ['real sociedad de futbol', 'real sociedad'], 'Málaga': ['malaga'],
    'Dortmund': ['borussia dortmund', 'dortmund'], 'Bayern': ['bayern munchen', 'bayern munich', 'bayern'],
    'Werder': ['werder bremen', 'werder'], 'Leverkusen': ['bayer 04 leverkusen', 'bayer leverkusen', 'leverkusen'],
    'Mainz': ['1 mainz 05', 'mainz 05', 'mainz'], 'Elversberg': ['sv 07 elversberg', '07 elversberg', 'elversberg'],
    'Leipzig': ['rb leipzig', 'leipzig'], 'Francoforte': ['eintracht frankfurt', 'frankfurt', 'e frankfurt'],
    'Schalke': ['schalke 04', 'schalke'], 'Paderborn': ['sc paderborn 07', 'paderborn 07', 'paderborn'],
    'Colonia': ['1 koln', 'koln', 'cologne', 'fc koln'], 'Hoffenheim': ['1899 hoffenheim', 'tsg 1899 hoffenheim', 'hoffenheim'],
    'Stuttgart': ['vfb stuttgart', 'stuttgart'], 'Amburgo': ['hamburger sv', 'hamburg', 'hsv'],
    'Union Berlino': ['1 union berlin', 'union berlin'], 'Gladbach': ['borussia monchengladbach', 'monchengladbach', 'gladbach'],
    'Freiburg': ['sc freiburg', 'freiburg'], 'Augsburg': ['fc augsburg', 'augsburg'],
    'Lione': ['olympique lyonnais', 'lyon', 'lyonnais'], 'Marsiglia': ['olympique de marseille', 'olympique marseille', 'marseille'],
    'Nizza': ['nice', 'ogc nice'], 'Tolosa': ['toulouse'], 'Strasburgo': ['strasbourg', 'rc strasbourg alsace', 'strasbourg alsace'],
    'PSG': ['paris saint germain', 'paris saint-germain', 'psg'], 'Paris FC': ['paris'], 'Le Mans': ['le mans'],
    'Monaco': ['as monaco', 'monaco'], 'Lille': ['lille osc', 'losc lille', 'lille'], 'Lens': ['rc lens', 'lens'],
    'Rennes': ['stade rennais', 'rennes'], 'Brest': ['stade brestois 29', 'stade brestois', 'brest'],
    'Angers': ['angers sco', 'angers'], 'Auxerre': ['aj auxerre', 'auxerre'], 'Lorient': ['fc lorient', 'lorient'],
    'Troyes': ['estac troyes', 'troyes'], 'Le Havre': ['le havre ac', 'le havre'],
    'AZ': ['az alkmaar', 'az'], 'NEC': ['nec nijmegen', 'nec'], 'Twente': ['fc twente 65', 'twente'],
    'Heerenveen': ['sc heerenveen', 'heerenveen'], 'Sparta Rotterdam': ['sparta rotterdam', 'sparta'],
    'Fortuna Sittard': ['fortuna sittard'], 'Go Ahead Eagles': ['go ahead eagles'], 'PEC Zwolle': ['pec zwolle'],
    'ADO Den Haag': ['ado den haag'], 'Willem II': ['willem ii'], 'Utrecht': ['fc utrecht', 'utrecht'],
    'Groningen': ['fc groningen', 'groningen'], 'Excelsior': ['sbv excelsior', 'excelsior'], 'Telstar': ['sc telstar', 'telstar'],
    'Cambuur': ['sc cambuur', 'cambuur'], 'Ajax': ['ajax'], 'PSV': ['psv', 'psv eindhoven'], 'Feyenoord': ['feyenoord'],
    'Porto': ['porto'], 'Sporting': ['sporting clube de portugal', 'sporting cp', 'sporting lisbon', 'sporting lisboa', 'sporting'],
    'Benfica': ['benfica', 'sl benfica'], 'Braga': ['sporting braga', 'sc braga', 'braga'],
    'Vitória SC': ['vitoria guimaraes', 'vitoria sc', 'vitoria de guimaraes'], 'Santa Clara': ['santa clara'],
    'Arouca': ['arouca'], 'Gil Vicente': ['gil vicente'], 'Académico Viseu': ['academico de viseu', 'academico viseu'],
    'Estrela Amadora': ['estrela da amadora', 'estrela amadora'], 'Alverca': ['alverca'], 'Marítimo': ['maritimo'],
    'Moreirense': ['moreirense'], 'Famalicão': ['famalicao'], 'Nacional': ['nacional', 'nacional da madeira'],
    'Rio Ave': ['rio ave'], 'Casa Pia': ['casa pia'], 'Estoril': ['estoril praia', 'estoril']
  };
  // Restituisce il nome della pagina che corrisponde a una squadra dell'API ({name, shortName}), oppure null.
  function matchTeam(api, siteNames) {
    var cands = [norm(api && api.shortName), norm(api && api.name)].filter(Boolean);
    var best = null, bestLen = 0;
    function pad(s) { return ' ' + s + ' '; }
    siteNames.forEach(function (n) {
      var variants = (ALIAS[n] || []).concat([norm(n)]);
      variants.forEach(function (v) {
        if (!v) return;
        cands.forEach(function (c) {
          var hit = c === v || pad(c).indexOf(pad(v)) >= 0;
          if (hit && v.length + (c === v ? 100 : 0) > bestLen) { best = n; bestLen = v.length + (c === v ? 100 : 0); }
        });
      });
    });
    return best;
  }
  var api = { norm: norm, matchTeam: matchTeam };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NameMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
