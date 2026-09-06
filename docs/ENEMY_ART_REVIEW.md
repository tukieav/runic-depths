# Krytyczny przegląd oprawy przeciwników

Przegląd stanu wejściowego: `b29fba78908f2bd8ba373adc6a8395449665d169` (wersja 2.2). Zakres: wszystkie 24 typy zwykłych przeciwników, sześciu bossów, ich broń, anatomia, animacje oraz pociski. Wnioski wynikają z kodu generującego i wyświetlającego modele, definicji walki oraz istniejących zrzutów gry. To lista konkretnych usterek i kryteriów ich zamknięcia, nie certyfikat jakości AAA.

## Co było błędne i dlaczego ma to znaczenie

| Priorytet | Usterka i dowód w wersji wejściowej | Skutek podczas gry | Kryterium naprawy |
| --- | --- | --- | --- |
| P1 | `renderer.js:createActor` wybiera `skeleton` dla każdego `shape: humanoid`, ignorując `behavior` i tożsamość. Dotyczy to m.in. Zaklinacza Mchu, Szklanego Skryby, Przewodnika Żaru, Kantora Głębin, Orrena i Astera. | Postać wyglądająca na szermierza atakuje z daleka; model przekazuje graczowi fałszywą informację o zagrożeniu. | Każdy identyfikator ma jawnie przypisany model, broń, sposób ataku i typ pocisku. Łucznik ma łuk i kołczan, mag kostur/fokus, istota organiczna odpowiedni narząd ataku. |
| P1 | `createActor` sprowadza wszystkie duchy do `wraith`, wszystkie golemy do `brute`, humanoidy do `skeleton`. Bossy dostają ten sam model i większą skalę. | Odrębna nazwa i kolor zastępują projekt przeciwnika. Król, strażnik dzwonu i abstrakcyjna istota nie mają rozpoznawalnej tożsamości. | Osobny asset dla wszystkich 30 tożsamości; boss posiada co najmniej cztery charakterystyczne cechy fizyczne, odmienne od zwykłych wrogów rozdziału. |
| P1 | Gałąź `isInsect` w `createActor` ma `i < 3` po każdej stronie. | Każdy pająk, także Matrona Korzeni, ma sześć nóg. To błąd anatomii, którego nie naprawi wyższa rozdzielczość tekstury. | Osiem oddzielnych, stawowych nóg; prawidłowy ruch kolejnych par i spójna sylwetka w High oraz Performance. |
| P1 | Łapy ogarów oraz odnóża pająków są scalane przez `Batch`; nie ma dla nich ruchomych stawów. `updateActors` potrafi poruszać tylko `leftLeg/rightLeg` humanoida. | Czworonogi i pająki przesuwają nieruchome łapy po podłodze; kołysanie całego korpusu nie jest chodem. | Rigi odpowiednie do anatomii, animowany cykl chodu, atak paszczą lub przednimi odnóżami i czytelne przeniesienie ciężaru. |
| P1 | `engine.js` tworzy pocisk w tej samej aktualizacji, w której ustawia `attackTime`. `character-assets.js` dopiero wtedy zaczyna animację przygotowania. | Pocisk wylatuje przed napięciem łuku lub ruchem rzucania zaklęcia. Sama obecność klipu `attack` nie oznacza synchronizacji walki. | Oddzielne przygotowanie, moment wypuszczenia i powrót do postawy; realny atak AI wypuszcza pocisk dopiero po przygotowaniu. |
| P1 | `engine.js:shoot` nie zachowuje źródłowego typu/uzbrojenia. `renderer.js:updateProjectiles` rysuje zawsze ten sam klejnot ze stożkiem. | Strzała, zarodnik, pryzmat i zaklęcie morskie są tym samym pociskiem w innym kolorze. | Pocisk niesie semantyczny typ; strzała ma drzewce, grot i lotki, magia/zarodniki właściwą geometrię i oprawę. |
| P1 | `updateActors` przekazuje wszystkim przeciwnikom `castTime: 0`; generyczny szkielet ma sekwencje zamachu mieczem. | Magowie wykonują cięcia przy rzucaniu zaklęcia. Przywoływanie nie ma czytelnej, własnej gestykulacji. | Sposób animacji wynika z jawnej roli; łuk celuje i naciąga cięciwę, mag zbiera energię, zwierzę gryzie, ciężka istota uderza z odpowiednią bezwładnością. |
| P2 | Każdy pocisk jest rysowany na wysokości `0.52`, niezależnie od modelu, skali bossa i faktycznego źródła. | Pocisk może zaczynać lot przy kolanach postaci albo poniżej jej broni. | Wysokość i początek efektu uwzględniają rolę oraz skalę, a zbliżenie potwierdza połączenie efektu z bronią/paszczą/fokusem. |
| P2 | Dla wrogów `prepareCharacterVisual` nakłada barwę typu na współdzielony bazowy model. | Różnica kolorystyczna nie daje kontrastu między metalem, tkaniną, kością i naturalnym pancerzem; szczegóły zlewają się z daleka. | Palety rozdziałów określają osobno korpus, pancerz, tkaninę, akcent i blask; sylwetka pozostaje czytelna bez koloru. |
| P1 QA | Dotychczasowe zrzuty rozdziałów powstają przy bezpiecznym punkcie startowym. Przykład: `qa/cinematic/chapter-2-desktop.png` pokazuje bohatera i NPC, ale żadnego przeciwnika. | Zielone testy renderera, poprawny glTF i sześć ładnych kadrów środowiska nie wykrywają miecza u maga ani sześciu nóg pająka. | Osobne kadry wszystkich typów, zbliżenia bossów, ujęcia aktywnego ataku dwóch łuczników i sprawdzenie prawdziwych pocisków z AI. |

## Zatwierdzona korekta ról

W pierwotnej zawartości nie istniał jawnie opisany łucznik: dystans oznaczał także duchy, magię oraz zarodniki. Nie należy wyposażać ich wszystkich w łuki. Dwie tożsamości otrzymują jednoznaczną rolę łucznika: Cierniowy Czyhacz z drewnianym łukiem oraz Przewodnik Żaru z łukiem i żarzącymi grotami. Opisy polskie i angielskie zostały dostosowane. Czyhacz zmienia zachowanie z walki wręcz na dystansowe i zasięg z 1,7 na 6; to rzeczywista zmiana starć rozdziału II, wymagająca ponownego przejścia testów kampanii. Przewodnik zachowuje dotychczasowe parametry ataku dystansowego.

Kontrakt w `src/enemy-presentation.js` obejmuje następujące role:

| Typ | Broń / źródło | Atak | Wyróżniki sylwetki |
| --- | --- | --- | --- |
| Pusty Strażnik | Miecz | Cięcie | Pusta przyłbica, tarcza warty, nitowany pancerz |
| Pełzacz Krypt | Szczękoczułki/pazury | Atak odnóżami | Osiem nóg, segmentowany odwłok, woskowy pancerz |
| Ognik Świec | Rdzeń latarni | Pocisk duszy | Metalowa klatka, korona wosku, łańcuch |
| Dzwonowy Ogar | Kły | Ugryzienie | Cztery łapy, obroża z dzwonem, długa paszcza |
| Cierniowy Czyhacz | Drewniany łuk | Strzała | Cięciwa, kołczan, kaptur liści, naramienniki z kory |
| Tkacz Zarodników | Organ zarodnikowy | Zarodnik | Osiem nóg, worki zarodników, grzybowy pancerz |
| Kolos Kory | Pięści korzeni | Ciężki cios | Pień, konary, wielkie sękate dłonie |
| Zaklinacz Mchu | Kostur | Cierń / przywołanie | Maska drewna, płaszcz mchu, amulety nasion |
| Lustrzany Rycerz | Miecz i tarcza | Cięcie | Fasetowany hełm, lustrzana tarcza, żłobienia pancerza |
| Pryzmatyczny Pyłek | Kryształowy rdzeń | Pryzmat | Odłamki na orbitach, otwarta klatka |
| Odłamkowy Skoczek | Kryształowe pazury | Atak odnóżami | Osiem nóg, ostrza stóp, kryształowe kolce |
| Szklany Skryba | Kostur pióra | Pryzmat / przywołanie | Otwarta księga, szklana maska, warstwy szat |
| Łańcuchowy Wartownik | Młot | Ciężki cios | Łańcuchy, krata przyłbicy, żelazny fartuch |
| Piecowy Ogar | Kły | Ugryzienie | Piecowa paszcza, pancerz z otworami, żar w grzbiecie |
| Żużlowy Tytan | Pięści | Ciężki cios | Rdzeń pieca, płyty żużlu, pięści kowadeł |
| Przewodnik Żaru | Łuk piecowy | Strzała | Cięciwa, kołczan, żarzące groty, maska sadzy |
| Związany Przypływem | Trójząb | Atak wręcz | Pancerz porośnięty skorupiakami, morski tabard |
| Latarnia Otchłani | Świecący organ | Pocisk przypływu | Kopuła meduzy, promieniste czułki, pierścień pereł |
| Koralowa Paszcza | Kły | Ugryzienie | Koralowe poroże, szeroka paszcza, płyty rafy |
| Kantor Głębin | Kostur muszli | Przypływ / przywołanie | Welon chóru, naszyjnik muszli, faliste szaty |
| Paladyn Pustki | Miecz i tarcza | Cięcie | Rozdwojony hełm, długa tarcza, czarny pancerz |
| Pożeracz Gwiazd | Kły | Ugryzienie | Rozdwojona paszcza, gwiezdne kolce, rozwidlony ogon |
| Tkacz Nicości | Organ nicości | Pocisk pustki | Osiem nóg, pusty odwłok z pierścieni, ostrogi |
| Archont Echa | Rdzeń rady | Pustka / przywołanie | Trzy maski, pęknięta aureola, warstwowy płaszcz |
| Veyr | Wielki młot dzwonu | Uderzenie rezonansu | Dzwony na barkach, zegarowy napierśnik, ciężki łańcuch |
| Matrona Korzeni | Korzenie / nasiona | Ciernie / przywołanie | Osiem korzeniowych nóg, korona drzewa, latarnie nasion |
| Ilyra | Kryształowy rdzeń | Pryzmat | Aureola siedmiu odłamków, twarz szkła, astrolabium |
| Kord | Młot sędziego | Cios i szarża | Wagi na barkach, piecowa twarz, zerwane kajdany |
| Orren | Królewski trójząb | Przypływ / przywołanie | Koralowa korona, królewski pancerz, morski płaszcz |
| Aster | Otwarty fokus dłoni | Pustka | Krosno imion, pierścienie, znak serca, warstwowe szaty |

## Czego samo dodanie modeli nie zamyka

Na obejrzanym kadrze Ogrodów Splątanych Korzeni (`qa/cinematic/chapter-2-desktop.png`) duże, płaskie zielone owale i proste brązowe patyki odcinają się od szczegółowszego kamienia. Są czytelnymi geometrycznymi zastępnikami roślinności. NPC korzystający z wyglądu Wyroczni stoi obok praktycznie identycznej bohaterki. Powtarzalne wnęki, równa siatka posadzki i podobne kompozycje pomieszczeń również pozostają widoczne. Nowa seria przeciwników nie rozwiązuje automatycznie tych problemów środowiska i obsady.

Dokładne miejsce roślinności w stanie wejściowym: `src/renderer.js:build(world)`, linie 722–739. Gałąź `chapterId === 'rootbound'` tworzy siedem `GEO.circle` na pokój, skaluje je do elips i nakłada nieteksturowane materiały `moss/paleMoss`; pojedynczy `GEO.box` na wysokości 0,023 tworzy patyk. Materiały kory i liści pochodzą z linii 497–498. Osobna gałąź wnęki w liniach 862–877 buduje roślinę z trzech walców i trzech wielościanów. Zalecany punkt podmiany: dokładnie gałąź rozdziału II w pętli pokoi, przez osobny moduł przyjmujący `batch`, renderer/materialy, środek pokoju, ziarno oraz `isFloor`. Zastąpić elipsy drobnymi kępami mchu z nieregularnym brzegiem i korzeniami o zmiennym przekroju, zachować wolne przejście oraz istniejące grupowanie statycznej geometrii. Nie dokładać nowych owali nad starymi. Źródło identycznych NPC: `src/renderer.js:createObject`, linia 1463, bezwarunkowe `createCharacterVisual('oracle')` dla każdego obiektu `npc`.

Powyższe obserwacje i numery linii opisują wersję wejściową. Stan napraw wersji 2.3 opisuje osobna tabela poniżej; kod i eksporty nie zastępują końcowej weryfikacji właściwego pakietu.

Liczba trójkątów, kości czy klipów nie jest wynikiem oceny artystycznej. Model może mieć 30 tysięcy trójkątów i nadal błędną anatomię, niedopasowaną broń albo ślizgające się stopy. Wynik należy oceniać przy docelowej kamerze, w ruchu, w tłumie i na urządzeniu docelowym. Przybliżenie modelu w galerii jest dodatkowym dowodem, a nie zastępstwem walki.

## Dowody wymagane do zamknięcia tej iteracji

1. `tests/enemy-presentation.test.mjs`: wszystkie tożsamości pokryte, zgodność AI–broń–pocisk, prawidłowe rozróżnienie łuczników i magów, cechy bossów, prawidłowe rozwiązywanie identyfikatorów instancji. Te testy weryfikują kontrakt danych; same nie dowodzą obecności geometrii.
2. Test przeglądarkowy i galeria wszystkich 30 modeli: model istnieje, ma oczekiwaną broń/anatomię, animuje się i pozostaje semantycznie poprawny po przełączeniu jakości oraz niedostępności assetu.
3. Test prawdziwego ataku AI: przygotowanie bez przedwczesnego pocisku, wypuszczenie strzały po naciągu, poprawny typ pocisku i niezależna animacja zaklęcia.
4. Ponowne testy rozgrywki/kampanii, ponieważ Cierniowy Czyhacz zmienia rolę w walce.
5. Pomiar pakietu i sceny z przeciwnikami: współdzielone tekstury nie powinny być niepotrzebnie kopiowane do każdego GLB; sprawdzić pamięć po zmianach scen i przywróceniu WebGL.
6. Oględziny kadrów i nagrania. Raport końcowy ma oddzielić błędy rzeczywiście usunięte od dalszego długu oprawy; przejście testów nie uprawnia do deklaracji osiągnięcia poziomu Diablo III ani akceptacji CrazyGames.


## Naprawy wdrożone w kodzie i assetach 2.3

Poniższa tabela odpowiada kolejno dziesięciu punktom przeglądu wejściowego. Rozdziela zaimplementowaną korektę, istniejące asercje oraz pozostały zakres oceny. Tożsamości i geometria są rzeczywiste: manifest `assets/enemies/manifest.json` zawiera 60 eksportów, a pięć modeli bohaterów pozostaje w oddzielnym zestawie. Wycofano trzy stare generyczne modele wrogów.

| Punkt | Konkretna korekta | Dowód i ograniczenie |
| --- | --- | --- |
| 1. Broń niezgodna z AI | `createActor` rozwiązuje `enemyPresentation(data)` i `createEnemyVisual` według identyfikatora. Dwa typy mają łuki, kostury i fokusy pozostają u magów. `enemy-fallback.js` zachowuje rolę również bez GLB. | Test danych porównuje zachowanie AI z bronią i pociskiem. Test przeglądarkowy sprawdza rzeczywiste części łuku, cięciwę, kołczan i brak miecza u obu łuczników, także po zablokowaniu assetów. |
| 2. Boss jako powiększony zwykły model | Wszystkie 30 tożsamości ma własny GLB High i LOD. Manifest zawiera m.in. dzwonową głowę Veyra, rozgałęzioną koronę Matrony, pryzmatyczne skrzydła Ilyry, koronę-kowadło Korda, koralową koronę Orrena oraz aureolę zaćmienia Astera. | Test weryfikuje 30 różnych załadowanych identyfikatorów i zgodność geometrii z manifestem. Docelowe hasła projektu z tabeli ról nie są dowodem wykonania każdego planowanego ornamentu; wiążąca lista wykonanych części jest w manifeście. |
| 3. Sześć nóg pająka | Osobny rig pajęczaków zawiera osiem górnych odnóży, osiem dolnych segmentów oraz ruchome szczękoczułki; Matrona używa tej samej poprawnej anatomii. | Test przeglądarkowy liczy osiem rzeczywistych kości odnóży High, a nie tylko tekstową etykietę `spider`. Osobna kontrola Performance sprawdza identyfikator, rzeczywistą geometrię LOD i zachowany rig; pełną listę kości zapisuje w raporcie. |
| 4. Nieruchome łapy | Ogary mają rig czworonoga z parami stawowych łap i szczęką; pajęczaki otrzymują własny cykl ruchu. `createEnemyVisual` odtwarza animacje klonowanego szkieletu. | Asercje sprawdzają zmiany pozycji kości oraz zachowane klipy. Eliminacja całego poślizgu stóp wymaga dalszego oglądania chodu na zakrętach i podczas separacji tłumu; same zmieniające się macierze tego nie dowodzą. |
| 5. Pocisk przed przygotowaniem | Zwykły atak dystansowy ma `rangedWindup = 0.32`, zapamiętany kierunek i dopiero późniejszą emisję. Specjalny atak bossa ma przygotowanie 0,55 s. Łucznicy odtwarzają dedykowane `shoot/shoot_alt` z ważonym stawem `bow_draw`. | Testy silnika sprawdzają brak pocisku podczas przygotowania, cel zachowany po uskoku i anulowanie strzału przy przesłonięciu. Test przeglądarkowy próbuje rzeczywisty atak AI i sprawdza zmianę pozy podczas przygotowania oraz późniejszy pocisk. |
| 6. Jeden klejnot dla wszystkich pocisków | `shoot` zachowuje `kind` oraz `sourceType`. `projectile-presentation.js` buduje strzały z drzewcem/grotem/lotkami, zarodniki, pryzmaty, perły/fale, ciernie, płomienie dusz i pierścienie pustki. | Przeglądarka sprawdza nie tylko typ w danych, lecz geometrię rzeczywiście dodaną do renderera. Strzały Przewodnika Żaru mają dodatkowo żarzący grot. Dźwięk emisji rozróżnia strzałę. |
| 7. Mag wykonuje cięcie | Renderowane `castTime` pochodzi teraz ze stanu przeciwnika. Własny odtwarzacz wybiera rzut zaklęcia, strzał z łuku albo atak anatomiczny. | Test AI sprawdza `cast` u magicznych przeciwników i `shoot` u łuczników. Zwykłe przywołanie ma osobne przygotowanie 0,40 s i znak na podłodze; pomocnik pojawia się po geście. Dwie dodatkowe regresje sprawdzają opóźnienie, ponowną kontrolę wolnego miejsca oraz anulowanie przygotowania przy wskrzeszeniu; odczyt zapisu usuwa stan trwającego przywołania. |
| 8. Uniwersalna wysokość 0,52 | Wysokość pocisku wynika z budowy i skali źródła; podczas lotu przechodzi ku wysokości celu. | `sourceHeight` jest testowane, a geometria używa `projectileHeight`. **Częściowa korekta:** brak odczytu dokładnego punktu emisji z animowanej dłoni/łuku/paszczy; połączenie z każdym ruchem broni wymaga dalszej pracy. |
| 9. Jedna barwa całego modelu | Wierzchołki mają palety oddzielnych części, a wspólny atlas zawiera osobne regiony materiałowe. Sześć buforowanych materiałów tematycznych współdzieli cztery mapy 1024 × 1024. | Test sprawdza rzeczywiste dane normalnych i szorstkości oraz włączone kolory wierzchołków. **Częściowa korekta:** atlas jest współdzielony, ma powtarzalne generowane wzory; nie są to indywidualnie malowane lub skanowane tekstury każdego potwora. |
| 10. Kadry bez przeciwników | `tests/enemy-browser.mjs` tworzy komplet wszystkich 30 tożsamości, zbliżenia, kadry rozdziałów z wrogami, próby ataku, LOD i brakujących assetów. | `qa/enemies/results.json`, `all-30-contact-sheet.png` oraz kadry pojedynczych modeli pozwalają sprawdzić obsadę. Końcowy raport musi mieć te same hashe co wydany pakiet; historyczny zielony raport nie wystarcza. |

Kontrola nagrania wykazała też błędny komunikat o żyjącym strażniku po pokonaniu bossa. HUD sprawdza teraz obecność żywego bossa, niezależnie od pozostałej liczby wymaganych starć; test portalu sprawdza osobno śmierć bossa i otwarcie zejścia.

Dodatkowo `src/garden-detail.js` zastępuje wykryte płaskie zielone elipsy nieregularnymi małymi kępami mchu. Wnęki mają korzenie o zwężanym przekroju, fałdowane listki paproci i grzyby z blaszkami, a ściany płytki bluszcz. Test pełnego przekształconego obrysu ogranicza wysoką roślinność do zablokowanych kafli; mech na przejściu nie przekracza sześciu centymetrów wysokości. Osobne budżety High/Performance ograniczają liczbę trójkątów. Usunięto kolidującą wnękę architektoniczną i osadzono rośliny na półce, żeby mur nie zasłaniał modelowanych grzybów oraz paproci. To naprawa konkretnego zastępczego elementu środowiska, nie przebudowa wszystkich pomieszczeń.

## Stan dowodów wydania 2.3

| Zakres | Aktualny stan | Właściwy dowód |
| --- | --- | --- |
| Testy jednostkowe zawartości, silnika, SDK, audio i ról | 71/71 zakończonych powodzeniem przed końcowym pakowaniem | `npm test`; liczba obejmuje nowe regresje ról, czasu ataku i zapisów |
| Kampania przez zwykłą walkę | Pięć klas oraz regresja widoczności zakończone powodzeniem, 6/6 | `qa/arpg/combat-soak.tap`; symulacja bota, nie ludzki czas rozgrywki |
| Struktura nowych modeli | 60 pełnych eksportów po dekompresji Meshopt: zero błędów walidatora; po dwa ostrzeżenia dotyczące generowanej przestrzeni stycznej i rodzica skinned mesh | `qa/enemies/gltf-validation.json`; raport wiąże wyniki z SHA assetów |
| Zachowane modele bohaterów | Pięć High i pięć LOD: zero błędów, po dwa analogiczne ostrzeżenia | `qa/graphics/gltf-validation.json`, `qa/graphics/lod-validation.json` |
| Galeria/animacje/AI/LOD/fallback | Końcowy build `bb5ca974…` na RTX 4090: 5/5 grup, 30 modeli High, 30 LOD, 15 realnych ataków dystansowych, deformacja obu cięciw i brak błędów. Obejrzano komplet 30 czytelnych kadrów; 136 hashy zgodnych z wydawanymi plikami | `qa/enemies/results.json` i komplet ujęć w `qa/enemies/` |
| Końcowe testy grafiki, kadru, UI, SDK/audio | Końcowe testy: grafika 9/9, kadry/animacje 10/10, rozgrywka/UI 13/13. Wszystkie zapisane hashe zgodne z buildem. Ponadto SDK/platforma 8/8 i 26 rzeczywistych próbek OGG w Chrome bez błędów | `qa/graphics/results.json`, `qa/cinematic/results.json`, `qa/arpg/browser-results.json`, `qa/arpg/platform-results.json` |
| CI, ZIP i publiczna wersja | Paczka obejmuje 136 plików, 19,74 MiB bez kompresji. CI blokuje publikację do przejścia pięciu zestawów przeglądarkowych, testów jednostkowych i kampanii; bieżący wynik konkretnego commitu jest w GitHub Actions | Wynik CI przypięty do commitu, `releases/manifest.json` i kontrola publicznych plików |
| Urządzenia docelowe / CrazyGames | Brak oficjalnej akceptacji portalu lub pomiaru na reprezentatywnym słabym urządzeniu | Osobny test portalu i fizycznych urządzeń |

Nie zamykam oceny stwierdzeniem „AAA”. High ma od 756 do 10 440 trójkątów na przeciwnika; mały unoszący się rdzeń jest znacznie prostszy od opancerzonego bossa. Modele powstały w autorskim generatorze Blender, a ruch z autorskich krzywych, bez motion capture i rozbudowanej mimiki. Powtarzalność architektury, współdzielone wzory materiałów oraz NPC nadal korzystający z modelu Wyroczni pozostają widocznym długiem oprawy. Naprawienie fałszywej broni i anatomii jest podstawowym wymogiem spójności gry, a nie uzasadnieniem deklaracji parytetu z Diablo III.


Dalsza ocena obejrzanej galerii wszystkich 30 modeli jest bardziej konkretna niż samo zastrzeżenie „to nie AAA”. Humanoidy nadal powtarzają podobną głowę, konstrukcję opancerzonej klatki piersiowej i proporcje, mimo innych broni i ornamentów. Veyr i Kord mają zbliżoną bazę golema oraz prostokątny młot; dodatki pomagają ich rozpoznać, lecz nie tworzą w pełni odmiennych sylwetek. Ogary współdzielą zasadniczy obrys ciała. Gładkie, zaokrąglone segmenty miejscami przypominają zabawkę lub robota. Detal normal map i regionów tkaniny nie zastępuje indywidualnie opracowanej anatomii, faktury powierzchni oraz ręcznego dopracowania deformacji. Łuki są teraz czytelne i zgodne z rolą — dalszym celem artystycznym powinno być przełamanie powtarzalności brył i jakości ruchu, a nie tylko podbijanie rozdzielczości wspólnego atlasu.
