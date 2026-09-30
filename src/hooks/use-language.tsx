import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Language = "nl" | "en";

const STORAGE_KEY = "sales-language";

const NL: Record<string, string> = {
  Dashboard: "Dashboard",
  Leads: "Leads",
  Settings: "Instellingen",
  "Sign out": "Afmelden",
  "Sales rep": "Verkoper",
  "Team leader": "Teamleider",
  "Leader view": "Teamleiderweergave",
  Both: "Beide",
  "Sign in": "Aanmelden",
  "Open the sales hub": "Open het verkoopprogramma",
  "Sales program · groups · events · corporate": "Verkoopprogramma · groepen · bedrijven",
  "Email outreach": "E-mailcontact",
  "Ads & inbound": "Advertenties & aanvragen",
  "Manual CSV upload": "Handmatige CSV-upload",
  "Ownership & priority": "Eigenaar & prioriteit",
  "Small, sharp dashboard": "Eenvoudig, duidelijk dashboard",
  "Connection requests, InMails and replies logged per contact.":
    "Connectieverzoeken, InMails en reacties per contactpersoon gelogd.",
  "Route ad leads to an owner with campaign attribution.":
    "Wijs advertentieleads met hun campagne toe aan een eigenaar.",
  "Any export, mapped to your fields in a few clicks.":
    "Koppel elk exportbestand in enkele klikken aan de juiste velden.",
  "Team leaders instantly see who already has an account.":
    "Teamleiders zien meteen wie een account al beheert.",
  "Pipeline value, channel mix and win rate at a glance.":
    "Kanalen, voortgang en resultaten in één oogopslag.",
  "Email, LinkedIn, ads and plain cold calling all land in the same shared lead database — with the full outreach journey, importance scoring, CSV uploads and team ownership so nobody works the same company twice.":
    "E-mail, LinkedIn en advertenties komen samen in één gedeelde leadlijst — met de volledige contacthistoriek, prioriteit, CSV-uploads en een duidelijke eigenaar zodat niemand hetzelfde bedrijf dubbel benadert.",
  "Full name": "Volledige naam",
  "Work email": "Werkmail",
  Password: "Wachtwoord",
  "Create my account": "Mijn account aanmaken",
  "Create an account": "Account aanmaken",
  "I already have an account": "Ik heb al een account",
  or: "of",
  "Your next deal starts here": "Je volgende deal begint hier",
  "Manage your contacts and incoming leads in one shared sales workspace.":
    "Beheer je contacten en binnenkomende leads in één gedeelde salesworkspace.",
  "Sales workspace": "Salesworkspace",
  "All accounts": "Alle accounts",
  "Sales overview": "Verkoopoverzicht",
  "No access yet?": "Nog geen toegang?",
  "Already have an account?": "Al een account?",
  "Continue with Google": "Doorgaan met Google",
  "Account created. Check your email to confirm, then sign in.":
    "Account aangemaakt. Bevestig via je e-mail en meld je daarna aan.",
  "Welcome to the sales hub": "Welkom in het verkoopprogramma",
  "Google sign-in failed. Try email instead.":
    "Aanmelden met Google is mislukt. Probeer je e-mailadres.",
  "Channels, progress and results at a glance.":
    "Kanalen, voortgang en resultaten in één oogopslag.",
  "Email, LinkedIn and ads all land in the same shared lead database — with the full outreach journey, importance scoring, CSV uploads and team ownership so nobody works the same company twice.":
    "E-mail, LinkedIn en advertenties komen samen in één gedeelde leadlijst — met de volledige contacthistoriek, prioriteit, CSV-uploads en een duidelijke eigenaar zodat niemand hetzelfde bedrijf dubbel benadert.",
  "New accounts start as Sales rep. A team leader can change your role later.":
    "Nieuwe accounts starten als verkoper. Een teamleider kan je rol later aanpassen.",
  "New accounts need admin approval before they can enter.":
    "Nieuwe accounts hebben goedkeuring van de beheerder nodig voordat ze toegang krijgen.",
  "Your account request has been sent": "Je accountaanvraag is verstuurd",
  "No account yet? Create one to start logging your outreach.":
    "Nog geen account? Maak er een aan om contacten te loggen.",
  "Page not found": "Pagina niet gevonden",
  "The page you're looking for doesn't exist or has been moved.":
    "De pagina die je zoekt bestaat niet of is verplaatst.",
  "Go home": "Naar startpagina",
  "This page didn't load": "Deze pagina kon niet laden",
  "Something went wrong on our end. You can try refreshing or head back home.":
    "Er ging iets mis. Probeer opnieuw of ga terug naar de startpagina.",
  "Try again": "Opnieuw proberen",
  "Sales dashboard": "Verkoopdashboard",
  "Sales command centre": "Verkoopoverzicht",
  "Last 7 days": "Laatste 7 dagen",
  "Last 30 days": "Laatste 30 dagen",
  "Last 90 days": "Laatste 90 dagen",
  "This year": "Dit jaar",
  "New leads in period": "Nieuwe leads in deze periode",
  "Total leads": "Totaal aantal leads",
  Won: "Gewonnen",
  Lost: "Verloren",
  "all channels": "alle kanalen",
  "still open": "nog open",
  Overdue: "Te laat",
  "Due today": "Vandaag gepland",
  "Next 7 days": "Volgende 7 dagen",
  "No date set": "Geen datum ingesteld",
  Unassigned: "Niet toegewezen",
  "All open": "Alle openstaande",
  "Open accounts": "Openstaande accounts",
  "open account": "openstaand account",
  "open accounts": "openstaande accounts",
  "past the agreed date": "na de afgesproken datum",
  "planned for today": "gepland voor vandaag",
  "coming up": "binnenkort",
  Today: "Vandaag",
  "This week": "Deze week",
  Later: "Later",
  "No date": "Geen datum",
  "Everyone's leads": "Leads van iedereen",
  "Only my leads": "Alleen mijn leads",
  "No date planned yet": "Nog geen datum gepland",
  "No contact yet": "Nog geen contact",
  "Sign in again to move this lead.": "Meld je opnieuw aan om deze lead te verplaatsen.",
  "Log outreach": "Contact loggen",
  "Outreach logged": "Contact gelogd",
  Account: "Account",
  Pipeline: "Pipeline",
  "Plan & log": "Plannen & loggen",
  "All owners": "Alle eigenaars",
  "My leads": "Mijn leads",
  Company: "Bedrijf",
  "Company *": "Bedrijf *",
  Contact: "Contactpersoon",
  "Contact name": "Naam contactpersoon",
  "Job title": "Functie",
  Phone: "Telefoon",
  Website: "Website",
  City: "Stad",
  Country: "Land",
  Channel: "Kanaal",
  Source: "Bron",
  Campaign: "Campagne",
  "Campaign / list": "Campagne / lijst",
  Stage: "Fase",
  "Pipeline stage": "Pipelinefase",
  Importance: "Prioriteit",
  Owner: "Eigenaar",
  Notes: "Notities",
  "Last touch": "Laatste contact",
  "All channels": "Alle kanalen",
  "All stages": "Alle fases",
  "Search company, contact, city, campaign…": "Zoek bedrijf, contactpersoon, stad of campagne…",
  "Lead added": "Lead toegevoegd",
  "Lead updated": "Lead bijgewerkt",
  "What did you send or discuss?": "Wat heb je verstuurd of besproken?",
  "New lead": "Nieuwe lead",
  "Export CSV": "CSV exporteren",
  "Save lead": "Lead opslaan",
  "Edit lead": "Lead bewerken",
  "Lead details": "Leadgegevens",
  New: "Nieuw",
  Contacted: "Gecontacteerd",
  Engaged: "Interesse",
  "Meeting booked": "Afspraak gepland",
  Meeting: "Afspraak",
  Closing: "Afronding",
  Closed: "Afgesloten",
  "In the list, nobody reached out yet.": "Staat in de lijst; er is nog geen contact opgenomen.",
  "First outreach is out, no reply yet.":
    "Het eerste contact is gebeurd, maar er is nog geen antwoord.",
  "They replied or showed interest.": "Ze hebben geantwoord of interesse getoond.",
  "A call or visit is agreed.": "Er is een gesprek of bezoek afgesproken.",
  "Everything is on the table, waiting for the final yes.":
    "Alles is besproken; we wachten op de definitieve bevestiging.",
  "Deal closed, they are a client.": "De deal is rond; ze zijn klant.",
  "No deal for now.": "Voorlopig geen deal.",
  "Send the first email, LinkedIn message or make the first call.":
    "Stuur de eerste e-mail of het eerste LinkedIn-bericht.",
  "Qualify the need and propose a date for a meeting.":
    "Breng de behoefte in kaart en stel een datum voor een afspraak voor.",
  "Prepare the meeting, then agree the details after it.":
    "Bereid de afspraak voor en leg daarna de details vast.",
  "Chase the decision maker and confirm the booking date.":
    "Volg op bij de beslisser en bevestig de boekingsdatum.",
  "Note the reason and set a date to try again later.":
    "Noteer de reden en plan een nieuwe poging op een later moment.",
  Email: "E-mail",
  Call: "Telefoongesprek",
  Note: "Notitie",
  "Ads / inbound": "Advertenties / aanvragen",
  Referral: "Doorverwijzing",
  "Website request": "Websiteaanvraag",
  "CSV import": "CSV-import",
  "Key account": "Belangrijk account",
  High: "Hoog",
  Medium: "Gemiddeld",
  Low: "Laag",
  Cold: "Laagste",
  "Settings & team": "Instellingen & team",
  "Team & ownership": "Team & eigenaars",
  "Connect ChatGPT": "ChatGPT koppelen",
  "Website requests": "Websiteaanvragen",
  "Invite a team member": "Teamlid uitnodigen",
  "Temporary password": "Tijdelijk wachtwoord",
  "Team (optional)": "Team (optioneel)",
  Role: "Rol",
  "Create account": "Account aanmaken",
  "Creating…": "Aanmaken…",
  "Move accounts to another owner": "Accounts naar een andere eigenaar verplaatsen",
  From: "Van",
  To: "Naar",
  "Pick a rep": "Kies een verkoper",
  Accounts: "Accounts",
  Live: "Actief",
  Touches: "Contactmomenten",
  "Their pipeline": "Hun pipeline",
  "Team member": "Teamlid",
  "Nobody in this role yet.": "Nog niemand met deze rol.",
  "Everything has an owner. Nice.": "Alles heeft een eigenaar.",
  "As admin you can create an account for anyone here and set their role right away. Share the temporary password with them — colleagues can also sign themselves up on the login page, and they start as Sales rep until you change their role above.":
    "Als beheerder kun je hier voor iedereen een account aanmaken en meteen een rol instellen. Deel het tijdelijke wachtwoord met hen — collega's kunnen zich ook zelf aanmelden en starten als verkoper totdat je hun rol hierboven wijzigt.",
  "Role updated": "Rol bijgewerkt",
  "Team member added": "Teamlid toegevoegd",
  "New account requests": "Nieuwe accountaanvragen",
  "Name not provided": "Naam niet ingevuld",
  Approve: "Accepteren",
  Decline: "Weigeren",
  "Account approved": "Account geaccepteerd",
  "Account declined": "Account geweigerd",
  "Request declined": "Aanvraag geweigerd",
  "Waiting for approval": "Wachten op goedkeuring",
  "Your account request was not approved. Contact the administrator.":
    "Je accountaanvraag werd niet goedgekeurd. Neem contact op met de beheerder.",
  "Your request has been sent. You will get access when the administrator approves your account.":
    "Je aanvraag is verstuurd. Je krijgt toegang zodra de beheerder je account accepteert.",
  "Connect ChatGPT | Sales CRM": "ChatGPT koppelen | Sales CRM",
  "Your connection URL": "Jouw verbindingsadres",
  "Copy URL": "Adres kopiëren",
  "Set it up in ChatGPT": "Instellen in ChatGPT",
  "Or paste this in a manual config file": "Of plak dit in een handmatig configuratiebestand",
  "Copy config": "Configuratie kopiëren",
  "What ChatGPT can do for you": "Wat ChatGPT voor je kan doen",
  "Everything ChatGPT adds shows up instantly on Leads and the dashboard, with your name on the touch.":
    "Alles wat ChatGPT toevoegt verschijnt meteen bij Leads en het dashboard, met jouw naam bij het contactmoment.",
  "Every rep gets their own connection. ChatGPT signs in as you, so anything it adds lands on your accounts and respects the same permissions as the app — nobody sees more than they should.":
    "Elke verkoper krijgt een eigen verbinding. ChatGPT meldt zich aan als jou, zodat alles op jouw accounts terechtkomt en dezelfde toegangsrechten gebruikt.",
  "Add a new B2B account from email, LinkedIn, ads or cold calling.":
    "Voeg een nieuw B2B-account toe vanuit e-mail, LinkedIn of advertenties.",
  "Look up accounts before adding anything, so no duplicates.":
    "Zoek accounts op vóór je iets toevoegt en vermijd duplicaten.",
  "Log an email, LinkedIn message, ad reply, call, meeting or note.":
    "Log een e-mail, LinkedIn-bericht, advertentiereactie, gesprek, afspraak of notitie.",
  "Move a deal to contacted, engaged, meeting, closing, won or lost.":
    "Verplaats een deal naar gecontacteerd, interesse, afspraak, afronding, gewonnen of verloren.",
  "Ask ChatGPT how your pipeline looks right now.":
    "Vraag ChatGPT hoe je pipeline er nu voor staat.",
  "Import new ones as leads": "Nieuwe contacten als leads importeren",
  "Hub leads that are brand new": "Volledig nieuwe leads",
  "Search company, contact, tag or account manager":
    "Zoek bedrijf, contactpersoon, tag of accountmanager",
  "Account manager": "Accountmanager",
  Tags: "Tags",
  Remove: "Verwijderen",
  "Not signed in": "Niet aangemeld",
  "Nothing to import.": "Niets om te importeren.",
  "This file has no data rows.": "Dit bestand bevat geen gegevensrijen.",
  "CSV import | Sales CRM": "CSV importeren | Sales CRM",
  "Not mapped": "Niet gekoppeld",
  "Upload the file": "Bestand uploaden",
  "Map columns": "Kolommen koppelen",
  Required: "Verplicht",
  "Skip duplicates": "Duplicaten overslaan",
  "Update existing": "Bestaande bijwerken",
  "Every channel — email, LinkedIn, ads and referrals — in one place.":
    "Elk kanaal — e-mail, LinkedIn, advertenties en doorverwijzingen — op één plek.",
  "Key accounts to protect": "Belangrijke accounts om te bewaken",
  "Latest logged outreach": "Laatst gelogd contact",
  "Leads per channel": "Leads per kanaal",
  "No leads yet — add one or import a CSV to get started.":
    "Nog geen leads — voeg er een toe of importeer een CSV om te starten.",
  "No new leads in this period — widen the reporting period above.":
    "Geen nieuwe leads in deze periode — vergroot de periode hierboven.",
  "Nothing logged yet.": "Nog niets gelogd.",
  "Open leads": "Open leads",
  "Pipeline stages": "Pipelinefases",
  "Reporting period": "Rapportageperiode",
  "Nothing in this group.": "Niets in deze groep.",
  "To contact": "Te contacteren",
  "View only": "Alleen bekijken",
  "CSV file": "CSV-bestand",
  "Campaign / list name": "Campagne / lijstnaam",
  "Channel these leads came from": "Kanaal waarvan deze leads komen",
  "Matched on email, then LinkedIn URL, then company + contact name.":
    "Gematcht op e-mail, dan LinkedIn-URL, dan bedrijf + contactnaam.",
  "No imports yet.": "Nog geen imports.",
  "Recent imports": "Recente imports",
  "That file has no data rows.": "Dat bestand bevat geen gegevens.",
  "Update existing leads with new info": "Bestaande leads bijwerken met nieuwe info",
  "What to do with duplicates": "Wat doen met duplicaten",
  "Add a comment for this step...": "Voeg een opmerking toe voor deze stap...",
  "Comment saved": "Opmerking opgeslagen",
  "General notes about this account...": "Algemene notities over dit account...",
  History: "Geschiedenis",
  "LinkedIn URL": "LinkedIn-URL",
  "Log a company from any channel. You become the owner.":
    "Log een bedrijf via elk kanaal. Jij wordt de eigenaar.",
  "Log it": "Loggen",
  "No comment on this step yet.": "Nog geen opmerking bij deze stap.",
  "No leads match these filters.": "Geen leads die aan deze filters voldoen.",
  "No outreach logged for this lead yet.": "Nog geen contact gelogd voor deze lead.",
  "Open LinkedIn profile": "Open LinkedIn-profiel",
  "Save comment": "Opmerking opslaan",
  "Show everyone's leads": "Toon de leads van iedereen",
  "Unassigned accounts": "Niet-toegewezen accounts",
  "Add as lead": "Toevoegen als lead",
  "All contacts": "Alle contacten",
  "Also a hub lead": "Ook een lead in de hub",
  Click: "Klik",
  Export: "Exporteren",
  "How to upload your contacts": "Zo upload je je contacten",
  "In the hub": "In de hub",
  "Lead CSV import": "Lead-CSV-import",
  "Not worked yet": "Nog niet opgevolgd",
  Synced: "Gesynchroniseerd",
  "Upload the file here": "Upload het bestand hier",
  "We skip what we already know": "We slaan over wat we al kennen",
  "Why this list matters": "Waarom deze lijst belangrijk is",
  "Add custom connector": "Aangepaste connector toevoegen",
  "Click connect and sign in with your hub account, then approve access.":
    "Klik op verbinden, meld je aan met je hub-account en keur de toegang goed.",
  "Name it": "Geef het een naam",
  "Signed in as": "Aangemeld als",
  "Due in the next 7 days.": "Gepland in de komende 7 dagen.",
  "Past the agreed date — do these first.": "Voorbij de afgesproken datum — doe deze eerst.",
  "Planned for today.": "Gepland voor vandaag.",
  "Planned further out.": "Later gepland.",
  Cancel: "Annuleren",
  "Yes, change step": "Ja, wijzig stap",
  "Change step?": "Stap wijzigen?",
  "Copy address": "Kopieer adres",
  "Copy token": "Kopieer token",
  "Copy example": "Kopieer voorbeeld",
  "New token created": "Nieuw token aangemaakt",
  "Receiving address": "Ontvangstadres",
  "B2B requests from the website": "B2B-aanvragen van de website",
  "Go to home page": "Naar startpagina",
};

const PATTERNS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [
    /^Step (\d+) of 5 — (.+)$/,
    (m) => {
      const label = m[2] ?? "";
      return `Stap ${m[1] ?? "1"} van 5 — ${NL[label] ?? label}`;
    },
  ],
  [/^Step (\d+)\/5$/, (m) => `Stap ${m[1]}/5`],
  [
    /^Move to (.+)$/,
    (m) => {
      const label = m[1] ?? "";
      return `Verplaats naar ${NL[label] ?? label}`;
    },
  ],
  [/^(\d+) leads exported$/, (m) => `${m[1]} leads geëxporteerd`],
  [/^Move (\d+) accounts$/, (m) => `${m[1]} accounts verplaatsen`],
  [/^(\d+) accounts moved$/, (m) => `${m[1]} accounts verplaatst`],
  [/^Unassigned accounts \((\d+)\)$/, (m) => `Niet-toegewezen accounts (${m[1]})`],
  [/^(.+) copied$/, (m) => `${m[1]} gekopieerd`],
];

const EN = Object.fromEntries(Object.entries(NL).map(([english, dutch]) => [dutch, english]));

function translate(value: string, language: Language) {
  const trimmed = value.trim();
  const direct = language === "nl" ? NL[trimmed] : EN[trimmed];
  if (direct) return value.replace(trimmed, direct);
  if (language === "en") return value;
  for (const [pattern, replacement] of PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return value.replace(trimmed, replacement(match));
  }
  return value;
}

type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void };
const LanguageContext = createContext<LanguageContextValue | null>(null);
const ORIGINAL_TEXT = new WeakMap<Node, string>();
const ATTRIBUTE_TEXT = new WeakMap<
  Element,
  Map<string, { original: string; translated: string }>
>();

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("nl");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en") setLanguageState("en");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = language;
    let observer: MutationObserver | undefined;
    const translateTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        const current = root.textContent ?? "";
        const saved = ORIGINAL_TEXT.get(root);
        const expected = saved ? translate(saved, language) : undefined;
        if (!saved || current !== expected) ORIGINAL_TEXT.set(root, current);
        const original = ORIGINAL_TEXT.get(root) ?? current;
        const next = translate(original, language);
        if (current !== next) root.textContent = next;
        return;
      }
      if (!(root instanceof Element)) return;
      if (["SCRIPT", "STYLE", "CODE", "PRE"].includes(root.tagName)) return;
      for (const attribute of ["placeholder", "title", "aria-label"]) {
        const current = root.getAttribute(attribute);
        if (!current) continue;
        const attributes = ATTRIBUTE_TEXT.get(root) ?? new Map();
        const previous = attributes.get(attribute);
        const original = previous && current === previous.translated ? previous.original : current;
        const translated = translate(original, language);
        attributes.set(attribute, { original, translated });
        ATTRIBUTE_TEXT.set(root, attributes);
        if (current !== translated) root.setAttribute(attribute, translated);
      }
      root.childNodes.forEach(translateTree);
    };
    const timer = window.setTimeout(() => {
      translateTree(document.body);
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) mutation.addedNodes.forEach(translateTree);
      });
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [language, ready]);

  const value = useMemo(
    () => ({
      language,
      setLanguage: (next: Language) => {
        window.localStorage.setItem(STORAGE_KEY, next);
        setLanguageState(next);
      },
    }),
    [language],
  );

  return (
    <LanguageContext.Provider value={value}>
      <div suppressHydrationWarning>{children}</div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  return (
    <div
      className={cn("flex items-center rounded-md border border-border p-0.5", className)}
      aria-label="Taal kiezen"
    >
      {(["nl", "en"] as const).map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={language === option ? "default" : "ghost"}
          className="h-7 px-2 text-xs uppercase"
          onClick={() => setLanguage(option)}
          aria-pressed={language === option}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}
