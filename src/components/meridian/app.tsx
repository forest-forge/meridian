import { Clock, Pill, Plane, Settings, ScrollText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { chime, unlockAudio } from "@/lib/chime";
import { FOOD_LABEL, WATER_LABEL, liveAgenda, makeTargetAt, scheduleZoneForDay } from "@/lib/schedule";
import { useMeridian } from "@/lib/store";
import { HOME_TZ, dayKeyInZone } from "@/lib/time";
import { History } from "./history";
import { Journey } from "./journey";
import { Kit } from "./kit";
import { LegEditor, MedicineEditor, SettingsSheet } from "./editors";
import { ShellProvider, type Tab } from "./shell";
import { Today } from "./today";
import { Wizard } from "./wizard";
import { Splash } from "./splash";
import { cn } from "@/lib/cn";

export function MeridianApp() {
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let cancel = false;
    const finish = () => {
      if (cancel) return;
      const state = useMeridian.getState();
      state.beginSetup();
      if ((useMeridian.getState().easeRev ?? 0) < 2) {
        useMeridian.getState().startFromUk(new Date());
      }
      setReady(true);
    };
    if (useMeridian.persist.hasHydrated()) finish();
    const unsub = useMeridian.persist.onFinishHydration(finish);
    void useMeridian.persist.rehydrate();
    return () => {
      cancel = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("meridian-splash") === "1") setEntered(true);
    } catch {
      setEntered(true);
    }
  }, []);

  if (!entered) {
    return (
      <Splash
        ready={ready}
        onEnter={() => {
          try {
            sessionStorage.setItem("meridian-splash", "1");
          } catch {
            /* private browsing */
          }
          setEntered(true);
        }}
      />
    );
  }

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
        <h1 className="font-display text-4xl font-medium tracking-tight">Meridian</h1>
      </main>
    );
  }

  return <Ready />;
}

function Ready() {
  const wizardDone = useMeridian((s) => s.wizardDone);
  const [now, setNow] = useState(() => new Date());
  const [phoneTz, setPhoneTz] = useState("Europe/London");
  const [tab, setTab] = useState<Tab>("today");
  const [planDay, setPlanDay] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [medicineId, setMedicineId] = useState<string | "new" | null>(null);
  const [legId, setLegId] = useState<string | "new" | null>(null);
  const seen = useRef(new Set<string>());
  const chimed = useRef(new Map<string, number>());

  useEffect(() => {
    const tick = () => {
      setNow(new Date());
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) setPhoneTz(zone);
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const state = useMeridian.getState();
    const zones = (key: string) => scheduleZoneForDay(key, state.legs, state.zoneChoice);
    const dayKey = dayKeyInZone(now, zones(dayKeyInZone(now, HOME_TZ)));
    const zone = zones(dayKey);
    const targetAt = makeTargetAt(state.legs, state.zoneChoice, phoneTz);
    const { doses, carry } = liveAgenda({
      medicines: state.medicines,
      dayKey,
      labelZone: zone,
      zoneForDay: zones,
      now,
      leadMinutes: state.leadMinutes,
      logs: state.logs,
      clock: state.bodyClock,
      shiftMinutesPerDay: state.shiftMinutesPerDay,
      targetAt,
      carryover: true,
      holidayStart: state.holidayStart,
      holidayEnd: state.holidayEnd,
    });
    const open = [...carry, ...doses].filter(
      (dose) => dose.state === "upcoming" || dose.state === "due" || dose.state === "overdue",
    );
    const urgent = open.some((dose) => dose.state === "due" || dose.state === "overdue");
    document.title = urgent ? "Due · Meridian" : "Meridian";
    for (const dose of open) {
      const dueish = dose.state === "due" || dose.state === "overdue";
      if (!seen.current.has(dose.key)) {
        seen.current.add(dose.key);
        notify(dose.name, dose.dose, FOOD_LABEL[dose.food], WATER_LABEL[dose.water], dose.localLabel, dose.ukLabel);
        if (state.sound && dueish) {
          chime();
          chimed.current.set(dose.key, Date.now());
        }
      } else if (state.sound && dueish) {
        const last = chimed.current.get(dose.key) ?? 0;
        if (Date.now() - last > 5 * 60_000) {
          chime();
          chimed.current.set(dose.key, Date.now());
        }
      }
    }
  }, [now, phoneTz]);

  const medicines = useMeridian((s) => s.medicines);
  const legs = useMeridian((s) => s.legs);
  const editingMedicine = medicineId && medicineId !== "new" ? medicines.find((item) => item.id === medicineId) ?? null : null;
  const editingLeg = legId && legId !== "new" ? legs.find((item) => item.id === legId) ?? null : null;

  if (!wizardDone) return <Wizard />;

  return (
    <ShellProvider value={{ now, phoneTz, planDay, setPlanDay, tab, setTab }}>
      <div className="min-h-dvh bg-bg text-fg" onPointerDown={unlockAudio}>
        <div className="mx-auto grid min-h-dvh w-full max-w-5xl lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="hidden border-line px-6 py-8 lg:block lg:border-r">
            <Brand />
            <Nav tab={tab} setTab={setTab} className="mt-8 grid gap-1" />
          </aside>
          <div className="mx-auto w-full max-w-lg px-4 py-6 pb-28 lg:max-w-xl lg:py-8 lg:pb-10">
            <div className="mb-6 flex items-center justify-between lg:hidden">
              <Brand />
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-md border border-line bg-surface"
                aria-label="Reminder settings"
                onClick={() => setSettings(true)}
              >
                <Settings className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mb-6 hidden justify-end lg:flex">
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm"
                onClick={() => setSettings(true)}
              >
                <Settings className="size-4" aria-hidden="true" />
                Reminders
              </button>
            </div>
            {tab === "today" ? <Today onEdit={(id) => setMedicineId(id)} /> : null}
            {tab === "kit" ? <Kit onAdd={() => setMedicineId("new")} onEdit={(id) => setMedicineId(id)} /> : null}
            {tab === "journey" ? <Journey onAdd={() => setLegId("new")} onEdit={(id) => setLegId(id)} /> : null}
            {tab === "log" ? <History /> : null}
          </div>
        </div>
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface lg:hidden">
          <Nav tab={tab} setTab={setTab} className="mx-auto grid max-w-lg grid-cols-4" />
        </nav>
        {settings ? <SettingsSheet now={now} phoneTz={phoneTz} onClose={() => setSettings(false)} /> : null}
        {medicineId ? (
          <MedicineEditor
            initial={medicineId === "new" ? null : editingMedicine}
            onClose={() => setMedicineId(null)}
          />
        ) : null}
        {legId ? <LegEditor initial={legId === "new" ? null : editingLeg} now={now} onClose={() => setLegId(null)} /> : null}
      </div>
    </ShellProvider>
  );
}

function Brand() {
  return (
    <div>
      <p className="font-display text-2xl font-medium tracking-tight">Meridian</p>
      <p className="text-sm text-subtle">Doses across the clocks</p>
    </div>
  );
}

function Nav({ tab, setTab, className }: { tab: Tab; setTab: (tab: Tab) => void; className?: string }) {
  const items: Array<{ id: Tab; label: string; icon: typeof Clock }> = [
    { id: "today", label: "Today", icon: Clock },
    { id: "kit", label: "Kit", icon: Pill },
    { id: "journey", label: "Journey", icon: Plane },
    { id: "log", label: "Log", icon: ScrollText },
  ];
  return (
    <div className={className}>
      {items.map((item) => {
        const Icon = item.icon;
        const current = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-2 text-sm",
              current ? "bg-surface-2 text-fg" : "text-subtle",
            )}
            onClick={() => setTab(item.id)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function notify(name: string, dose: string, food: string, water: string, local: string, uk: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(name, {
      body: `${dose}. ${food}. ${water}. ${local} here, ${uk} UK.`,
      lang: "en-GB",
    });
  } catch {
    /* The page reminder still shows. */
  }
}
