# app.py
import json, io, csv, time, random
from typing import List, Dict, Any
import streamlit as st
from openai import OpenAI
import os
from pathlib import Path

try:
    import pandas as pd
except Exception:
    pd = None

st.set_page_config(page_title="Luminoner / emitoner", layout="wide")


def secret_or_env(key: str, default: Any = None):
    try:
        if key in st.secrets:
            return st.secrets[key]
    except Exception:
        pass
    return os.getenv(key, default)


CATCH_ALL_VALUE = "uten-relevans"
INITIAL_CATEGORY_FIELDS = [
    {
        "id": 0,
        "label": "kategori",
        "values": "bokstavelig, metaforisk",
        "mode": "list",
        "prompt_note": "",
    },
]

META_ROW_INDEX_KEY = "__luminoner_input_index"
META_RECORD_ID_KEY = "__luminoner_internal_id"
RUNS_DIR_NAME = "runs"
CATEGORY_MODE_LABELS = {"unique": "Unik", "list": "Liste"}
DEFAULT_TARGET_MARKER_LEFT = "<b>"
DEFAULT_TARGET_MARKER_RIGHT = "</b>"
GEO_FIELD_OPTIONS = [
    {
        "key": "geo_historisk_navn",
        "label": "Historisk navn",
        "description": "Navn slik det står i kilden (eldre stavemåter beholdes).",
        "rule": "skal være navnet slik det står i kilden. Bruk «ukjent» hvis fragmentet ikke sier noe eksplisitt.",
        "json_hint": '"Christiania"',
        "default": True,
    },
    {
        "key": "geo_moderne_navn",
        "label": "Moderne navn",
        "description": "Dagens offisielle navn på stedet.",
        "rule": "skal være dagens offisielle navn (om mulig).",
        "json_hint": '"Oslo"',
        "default": True,
    },
    {
        "key": "geo_land_region",
        "label": "Land / region",
        "description": "Land eller region (f.eks. Norge, Tamil Nadu).",
        "rule": "skal være land eller regionen stedet tilhører.",
        "json_hint": '"Norge"',
        "default": True,
    },
    {
        "key": "geo_koordinater",
        "label": "Koordinater",
        "description": "Desimalgrader «lat,long» (f.eks. 59.9139,10.7522).",
        "rule": "skal være lat,long i desimalgrader (bruk punktum og komma mellom verdiene).",
        "json_hint": '"59.9139,10.7522"',
        "default": False,
    },
]

if "last_source_headers" not in st.session_state:
    st.session_state["last_source_headers"] = []

APP_PASSWORD = (
    secret_or_env("APP_PASSWORD", None)
    or secret_or_env("PASSWORD", "")
    or ""
).strip()


def gate():
    """
    Enkel passordbeskyttelse for offentlige deploys. Hopper over hvis APP_PASSWORD mangler.
    """
    if not APP_PASSWORD:
        return
    if st.session_state.get("authed"):
        return

    st.title("Luminoner – adgangskontroll")
    st.info("Appen krever passord før annoteringene kan brukes.")
    pw = st.text_input("Passord", type="password")
    if st.button("Logg inn"):
        if pw == APP_PASSWORD:
            st.session_state["authed"] = True
            st.success("Innlogget – laster appen …")
            st.rerun()
        else:
            st.error("Feil passord.")
    st.stop()


gate()


st.title("Luminoner – batchannotering")

st.markdown(
    """
    <style>
    .lum-section-title {
        margin: 1.2rem 0 0.35rem 0;
        padding: 0.5rem 0.75rem;
        border-radius: 0.5rem;
        background: #eef4ff;
        border-left: 0.35rem solid #4c6ef5;
        font-size: 1.18rem;
        font-weight: 700;
        color: #1f2a44;
    }
    .lum-section-subtitle {
        margin: 0.8rem 0 0.25rem 0;
        font-size: 1.02rem;
        font-weight: 650;
        color: #324b85;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def render_section_title(text: str):
    st.markdown(f'<div class="lum-section-title">{text}</div>', unsafe_allow_html=True)


def render_section_subtitle(text: str):
    st.markdown(
        f'<div class="lum-section-subtitle">{text}</div>', unsafe_allow_html=True
    )


def normalize_field_spec_entries(raw_fields: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_fields, list):
        return []

    normalized: List[Dict[str, Any]] = []
    for idx, item in enumerate(raw_fields):
        if not isinstance(item, dict):
            continue
        mode = str(item.get("mode", "list")).strip().lower()
        if mode not in {"unique", "list"}:
            mode = "list"
        normalized.append(
            {
                "id": idx,
                "label": str(item.get("label", "")).strip(),
                "values": str(item.get("values", "")).strip(),
                "mode": mode,
                "prompt_note": str(item.get("prompt_note", "")).strip(),
            }
        )
    return normalized

# ---------- Konfig ----------
API_KEY = secret_or_env("OPENAI_API_KEY")
if not API_KEY:
    st.error("Manglende OPENAI_API_KEY i .streamlit/secrets.toml eller miljøvariabel.")
    st.stop()
client = OpenAI(api_key=API_KEY)

if "model_select" not in st.session_state:
    st.session_state["model_select"] = "gpt-5-mini"
if "batch_size_input" not in st.session_state:
    st.session_state["batch_size_input"] = 10
if "temp_input" not in st.session_state:
    st.session_state["temp_input"] = 1.0

MODEL = str(st.session_state.get("model_select", "gpt-5-mini"))
BATCH_SIZE = int(st.session_state.get("batch_size_input", 10))
TEMP = float(st.session_state.get("temp_input", 1.0))

render_section_title("Annotering og promptkonstruksjon")
st.markdown("**Kategorioppsett (kolonner)**")
st.caption(
    "Del opp annoteringen i flere felter (f.eks. «sport», «økonomi», «konflikt»). "
    "Hvert felt får et eget sett med lovlige verdier."
)
st.caption(
    f"Verdien «{CATCH_ALL_VALUE}» legges automatisk til alle felter som en catch-all for "
    "fragmenter uten treff."
)
st.caption(
    "Legg gjerne inn «Prompt-utvidelse» per felt for ekstra tolkningsregler. Feltet kan stå tomt."
)

if "category_field_entries" not in st.session_state:
    st.session_state["category_field_entries"] = [
        dict(entry) for entry in INITIAL_CATEGORY_FIELDS
    ]
    st.session_state["category_field_counter"] = len(INITIAL_CATEGORY_FIELDS)

entries = st.session_state["category_field_entries"]

field_spec_export = {
    "version": 1,
    "fields": [
        {
            "label": str(entry.get("label", "")).strip(),
            "values": str(entry.get("values", "")).strip(),
            "mode": str(entry.get("mode", "list")).strip(),
            "prompt_note": str(entry.get("prompt_note", "")).strip(),
        }
        for entry in entries
    ],
}
field_spec_bytes = json.dumps(field_spec_export, ensure_ascii=False, indent=2).encode("utf-8")
spec_cols = st.columns([1, 1, 3])
with spec_cols[0]:
    st.download_button(
        "Last ned feltspec (JSON)",
        data=field_spec_bytes,
        file_name="luminoner_feltspec.json",
        mime="application/json",
        use_container_width=False,
    )
with spec_cols[1]:
    uploaded_field_spec = st.file_uploader(
        "Last opp feltspec (JSON)",
        type=["json"],
        key="field_spec_upload",
        help="Laster kun inn feltdefinisjoner (feltnavn, verdier, variant og prompt-utvidelser).",
    )
    if uploaded_field_spec is not None and st.button(
        "Bruk opplastet feltspec",
        key="apply_field_spec_button",
        use_container_width=False,
    ):
        try:
            parsed_spec = json.loads(uploaded_field_spec.getvalue().decode("utf-8"))
            raw_fields = (
                parsed_spec.get("fields", [])
                if isinstance(parsed_spec, dict)
                else parsed_spec
            )
            imported_entries = normalize_field_spec_entries(raw_fields)
            if not imported_entries:
                st.error("Fant ingen gyldige felt i feltspec-filen.")
            else:
                st.session_state["category_field_entries"] = imported_entries
                st.session_state["category_field_counter"] = len(imported_entries)
                for imported_entry in imported_entries:
                    eid = imported_entry["id"]
                    st.session_state[f"category_field_label_{eid}"] = imported_entry.get("label", "")
                    st.session_state[f"category_field_values_{eid}"] = imported_entry.get("values", "")
                    st.session_state[f"category_field_mode_{eid}"] = imported_entry.get("mode", "list")
                    st.session_state[f"category_field_prompt_note_{eid}"] = imported_entry.get("prompt_note", "")
                st.success(f"Lastet inn {len(imported_entries)} felt fra feltspec.")
                st.rerun()
        except Exception as e:
            st.error(f"Kunne ikke lese feltspec: {e}")
with spec_cols[2]:
    st.caption("Tips: Lagre feltspec for gjenbruk i nye analyser.")

if "target_marker_left_input" not in st.session_state:
    st.session_state["target_marker_left_input"] = DEFAULT_TARGET_MARKER_LEFT
if "target_marker_right_input" not in st.session_state:
    st.session_state["target_marker_right_input"] = DEFAULT_TARGET_MARKER_RIGHT
for option in GEO_FIELD_OPTIONS:
    state_key = f"geo_option_{option['key']}"
    if state_key not in st.session_state:
        st.session_state[state_key] = option.get("default", False)

st.divider()
st.markdown("**Definer felter**")
st.caption("Legg inn feltnavn, verdier, variant og eventuell prompt-utvidelse per felt.")

category_fields: List[Dict[str, Any]] = []
used_keys = set()
for idx, entry in enumerate(entries):
    with st.container(border=True):
        st.caption(f"Feltgruppe {idx + 1}")
        col_label, col_values, col_mode, col_remove = st.columns([1, 2, 0.8, 0.25])
        label_val = col_label.text_input(
            "Feltnavn",
            value=entry.get("label", ""),
            placeholder="f.eks. Sport",
            key=f"category_field_label_{entry['id']}",
        ).strip()
        values_val = col_values.text_area(
            "Tillatte verdier (kommaseparert)",
            value=entry.get("values", ""),
            placeholder="fotball, svømming",
            help="Separér alternativene med komma eller linjeskift.",
            height=80,
            key=f"category_field_values_{entry['id']}",
        )
        mode_default = entry.get("mode", "list")
        mode_val = col_mode.radio(
            "Variant",
            options=["unique", "list"],
            index=0 if mode_default == "unique" else 1,
            format_func=lambda opt: CATEGORY_MODE_LABELS.get(opt, opt),
            key=f"category_field_mode_{entry['id']}",
            horizontal=True,
            help="Unik = én verdi. Liste = 0–3 verdier fra samme vokabular.",
        )
        entry["mode"] = mode_val
        if col_remove.button(
            "Fjern",
            key=f"remove_category_field_{entry['id']}",
            use_container_width=True,
            disabled=len(entries) == 1,
        ):
            del entries[idx]
            st.rerun()
        prompt_note_val = st.text_input(
            "Prompt-utvidelse (valgfritt)",
            value=entry.get("prompt_note", ""),
            placeholder='f.eks. "Bruk bare ideologiske merkelapper, ikke temaord."',
            key=f"category_field_prompt_note_{entry['id']}",
            help="Ekstra instruks for dette feltet. Brukes direkte i den genererte prompten.",
        ).strip()
        entry["prompt_note"] = prompt_note_val

    display_label = label_val or f"Felt {idx + 1}"
    field_key = display_label
    base_key = field_key
    suffix = 2
    while field_key in used_keys:
        field_key = f"{base_key}_{suffix}"
        suffix += 1
    used_keys.add(field_key)

    tokens: List[str] = []
    for line in values_val.splitlines():
        tokens.extend(t.strip() for t in line.split(","))
    field_values = [t for t in tokens if t]
    if CATCH_ALL_VALUE not in field_values:
        field_values.append(CATCH_ALL_VALUE)

    category_fields.append(
        {
            "label": display_label,
            "key": field_key,
            "values": field_values,
            "mode": mode_val,
            "prompt_note": prompt_note_val,
        }
    )

action_cols = st.columns([0.25, 0.75])
with action_cols[0]:
    if st.button("➕ Legg til felt", use_container_width=True):
        next_id = st.session_state.get("category_field_counter", len(entries))
        entries.append(
            {
                "id": next_id,
                "label": "",
                "values": "",
                "mode": "list",
                "prompt_note": "",
            }
        )
        st.session_state["category_field_counter"] = next_id + 1
        st.rerun()
with action_cols[1]:
    st.caption("Bruk «Fjern» for å ta bort et felt (minst ett felt må eksistere).")


st.subheader("Geotagging (valgfritt)")
st.caption(
    "Bruk dette når fragmentet refererer til et sted du vil disambiguere. "
    "Markér hvilke geofelter modellen skal returnere per rad."
)
geo_enabled = st.checkbox(
    "Be modellen returnere geodata",
    key="geo_enabled_toggle",
    help="Når aktivert forsøker modellen å finne historisk/moderne navn, land og evt. koordinater.",
)
geo_fields_active: List[Dict[str, Any]] = []
if geo_enabled:
    st.caption(
        "Velg én eller flere geofelter (historiske navn, moderne navn, land, koordinater)."
    )
    geo_cols = st.columns(2)
    for idx, option in enumerate(GEO_FIELD_OPTIONS):
        col = geo_cols[idx % len(geo_cols)]
        checked = col.checkbox(
            option["label"],
            key=f"geo_option_{option['key']}",
            help=option["description"],
        )
        if checked:
            geo_fields_active.append(option)
    if not geo_fields_active:
        st.warning("Velg minst ett geofelt eller skru av geotagging.")
else:
    st.caption("Geotagging er av – aktiver for å få felter som historisk/moderne navn.")


def _values_display(values: List[str]) -> str:
    return ", ".join(f'"{v}"' for v in values) if values else '"verdi1", "verdi2"'


def _list_example(values: List[str]) -> str:
    if not values:
        return '["verdi1", "verdi2"]'
    sample = values[: min(2, len(values))]
    inner = ", ".join(f'"{v}"' for v in sample)
    return f"[{inner}]"


field_names_display = ", ".join(f'"{c["label"]}"' for c in category_fields)
if not field_names_display:
    field_names_display = '"kategori"'
field_rules_lines: List[str] = []
for c in category_fields:
    if c["mode"] == "list":
        field_rules_lines.append(
            f'- Feltet "{c["key"]}" kan inneholde opptil 3 verdier valgt fra: '
            f'{_values_display(c["values"])} (returner som liste).'
        )
    else:
        field_rules_lines.append(
            f'- Feltet "{c["key"]}" skal være én av: {_values_display(c["values"])}.'
        )
if not field_rules_lines:
    field_rules_lines = [
        '- Feltet "kategori" skal være én av: "kategori1", "kategori2".'
    ]
if geo_fields_active:
    field_rules_lines.append(
        "- Geofeltene beskriver stedet målordet peker på. Skriv «ukjent» når informasjon mangler."
    )
    for geo in geo_fields_active:
        field_rules_lines.append(
            f'- Feltet "{geo["key"]}" {geo["rule"]}'
        )
field_rules_lines.append(
    f'- Hvis ingen kode passer i et felt, bruk verdien "{CATCH_ALL_VALUE}".'
)
field_rules_text = "\n".join(field_rules_lines)
json_field_line_parts: List[str] = []
for c in category_fields:
    if c["mode"] == "list":
        json_field_line_parts.append(
            f'    "{c["key"]}": {_list_example(c["values"])},  '
            "// liste med 0–3 verdier fra settet over"
        )
    else:
        json_field_line_parts.append(
            f'    "{c["key"]}": <én av {_values_display(c["values"])}>,'
        )
for geo in geo_fields_active:
    json_field_line_parts.append(
        f'    "{geo["key"]}": {geo["json_hint"]},'
    )
json_field_lines = "\n".join(json_field_line_parts)
if not json_field_lines:
    json_field_lines = '    "kategori": <én av "kategori1", "kategori2">,'  # fallback


def build_excel_bytes(
    rows: List[Dict[str, Any]], columns: List[str]
) -> tuple[bytes | None, str | None]:
    """
    Bygger .xlsx-innhold fra rader/kolonner.
    Returnerer (bytes, None) ved suksess, ellers (None, feilmelding).
    """
    if pd is None:
        return None, "pandas er ikke tilgjengelig i miljøet."
    try:
        excel_io = io.BytesIO()
        pd.DataFrame(rows, columns=columns).to_excel(excel_io, index=False)
        return excel_io.getvalue(), None
    except Exception as e:
        return None, str(e)


def ensure_runs_dir() -> Path:
    runs_dir = Path(RUNS_DIR_NAME)
    runs_dir.mkdir(parents=True, exist_ok=True)
    return runs_dir


def _ts_now() -> str:
    return time.strftime("%Y-%m-%dT%H-%M-%S")


def make_run_id(run_mode: str) -> str:
    return f"{_ts_now()}_{run_mode}_{random.randint(1000, 9999)}"


def run_paths(run_id: str) -> tuple[Path, Path]:
    runs_dir = ensure_runs_dir()
    return runs_dir / f"{run_id}.jsonl", runs_dir / f"{run_id}.meta.json"


def append_jsonl_rows(path: Path, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    with path.open("a", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_jsonl_rows(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    out: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(item, dict):
                out.append(item)
    return out


def save_run_meta(path: Path, payload: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def clean_output_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned = [dict(row) for row in rows]
    if not cleaned:
        return cleaned

    def _row_sort_key(row: Dict[str, Any]):
        idx = row.get(META_ROW_INDEX_KEY)
        if idx is None:
            idx = row.get(META_RECORD_ID_KEY, 0)
        return (idx, row.get(META_RECORD_ID_KEY, 0))

    cleaned.sort(key=_row_sort_key)
    for row in cleaned:
        row.pop(META_ROW_INDEX_KEY, None)
        row.pop(META_RECORD_ID_KEY, None)
    return cleaned


def build_export_payloads(
    rows: List[Dict[str, Any]],
    category_fields: List[Dict[str, Any]],
    geo_fields_active: List[Dict[str, Any]],
    source_headers: List[str],
) -> tuple[bytes, bytes, bytes | None, str | None]:
    jsonl_buf = io.StringIO()
    for obj in rows:
        jsonl_buf.write(json.dumps(obj, ensure_ascii=False) + "\n")
    jsonl_bytes = jsonl_buf.getvalue().encode("utf-8")

    csv_buf = io.StringIO()
    ordered_keys: List[str] = []
    for o in rows:
        for k in o.keys():
            if k not in ordered_keys:
                ordered_keys.append(k)
    geo_field_keys = [g["key"] for g in geo_fields_active]
    analysis_order = (
        [c["key"] for c in category_fields]
        + geo_field_keys
        + [
            "karakteristikker",
            "begrunnelse",
        ]
    )
    source_keys = [k for k in source_headers if k in ordered_keys]
    fieldnames: List[str] = []

    def _extend(keys: List[str]):
        for key in keys:
            if not key:
                continue
            if key not in fieldnames:
                fieldnames.append(key)

    _extend(analysis_order)
    _extend(source_keys)
    remaining = [k for k in ordered_keys if k not in fieldnames]
    _extend(remaining)
    writer = csv.DictWriter(csv_buf, fieldnames=fieldnames)
    writer.writeheader()
    export_rows_for_table: List[Dict[str, Any]] = []
    for o in rows:
        o2 = {k: o.get(k, "") for k in fieldnames}
        if isinstance(o2.get("karakteristikker"), list):
            o2["karakteristikker"] = "|".join(o2["karakteristikker"])
        for field in category_fields:
            if field["mode"] == "list":
                values = o2.get(field["key"])
                if isinstance(values, list):
                    o2[field["key"]] = "|".join(values)
        writer.writerow({k: o2.get(k, "") for k in fieldnames})
        export_rows_for_table.append({k: o2.get(k, "") for k in fieldnames})
    csv_bytes = csv_buf.getvalue().encode("utf-8")
    excel_bytes, excel_export_error = build_excel_bytes(export_rows_for_table, fieldnames)
    return jsonl_bytes, csv_bytes, excel_bytes, excel_export_error


def render_results_panel(
    rows: List[Dict[str, Any]],
    category_fields: List[Dict[str, Any]],
    geo_fields_active: List[Dict[str, Any]],
    source_headers: List[str],
    run_mode: str | None = None,
    run_id: str | None = None,
    checkpoint_path: Path | None = None,
):
    from collections import Counter

    if not rows:
        st.warning("Ingen rader å vise.")
        return

    if not category_fields:
        st.warning("Ingen kategorifelter definert – oppdater oppsettet over.")
    else:
        for cat in category_fields:
            values_for_counts: List[str] = []
            empty_label = "(tom)"
            if cat["mode"] == "list":
                empty_label = "(tom liste)"
                for r in rows:
                    cell = r.get(cat["key"])
                    if isinstance(cell, list) and cell:
                        for val in cell:
                            text = str(val).strip()
                            values_for_counts.append(text or empty_label)
                    else:
                        values_for_counts.append(empty_label)
            else:
                for r in rows:
                    text = normalize_single_value(r.get(cat["key"], ""))
                    values_for_counts.append(text or empty_label)

            counts = Counter(values_for_counts)
            st.markdown(f"**Fordeling for {cat['label']}**")
            st.table({"verdi": list(counts.keys()), "antall": list(counts.values())})
            if counts and pd is not None:
                dfc = pd.DataFrame({"verdi": list(counts.keys()), "antall": list(counts.values())})
                st.bar_chart(dfc.set_index("verdi"))

    ts = _ts()
    jsonl_bytes, csv_bytes, excel_bytes, excel_export_error = build_export_payloads(
        rows=rows,
        category_fields=category_fields,
        geo_fields_active=geo_fields_active,
        source_headers=source_headers,
    )
    checkpoint_jsonl_bytes = checkpoint_path.read_bytes() if checkpoint_path and checkpoint_path.exists() else b""
    if run_id:
        st.caption(f"Checkpoint-id: {run_id}")
    if run_mode == "sample":
        st.info("Dette var et sample – bruk «Kjør alt» for å prosessere alle rader.")

    download_cols = st.columns(4)
    with download_cols[0]:
        st.download_button(
            "Last ned JSONL",
            data=jsonl_bytes,
            file_name=f"luminoner_{ts}.jsonl",
            mime="application/jsonl",
        )
    with download_cols[1]:
        st.download_button(
            "Last ned CSV",
            data=csv_bytes,
            file_name=f"luminoner_{ts}.csv",
            mime="text/csv",
        )
    with download_cols[2]:
        if excel_bytes:
            st.download_button(
                "Last ned Excel",
                data=excel_bytes,
                file_name=f"luminoner_{ts}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        else:
            st.caption(
                f"Excel-eksport er ikke tilgjengelig i dette miljøet: {excel_export_error or 'ukjent feil'}"
            )
    with download_cols[3]:
        if checkpoint_jsonl_bytes:
            st.download_button(
                "Last ned checkpoint (JSONL)",
                data=checkpoint_jsonl_bytes,
                file_name=f"{run_id or 'checkpoint'}.jsonl",
                mime="application/jsonl",
            )


# ---------- Data inn ----------
render_section_title("Data inn – konkordanser og merking")
st.caption(
    "Legg inn data som fritekst, CSV/TSV eller Excel. "
    "Velg deretter fragmentkolonne og target-markører."
)
src = st.radio(
    "Kilde",
    ["Lim inn", "Last opp CSV/TSV/Excel"],
    index=1,
    horizontal=True,
)

example_rows = [
    {
        "concordance": "A <b>klima</b> B",
        "doc_id": "eksempel-1",
        "note": "Bytt ut med egne fragmenter",
    },
    {
        "concordance": "A <b>migrasjon</b> B",
        "doc_id": "eksempel-2",
        "note": "Første rad er header",
    },
]
example_csv_buf = io.StringIO()
example_writer = csv.DictWriter(
    example_csv_buf, fieldnames=["concordance", "doc_id", "note"]
)
example_writer.writeheader()
example_writer.writerows(example_rows)
example_csv_bytes = example_csv_buf.getvalue().encode("utf-8")

example_xlsx_bytes, example_xlsx_error = build_excel_bytes(
    example_rows, ["concordance", "doc_id", "note"]
)

with st.expander("Eksempelfiler for opplasting", expanded=False):
    st.caption("Last ned en liten malfil og bruk den som utgangspunkt.")
    sample_cols = st.columns(2)
    with sample_cols[0]:
        st.download_button(
            "Last ned eksempel (CSV)",
            data=example_csv_bytes,
            file_name="luminoner_eksempel.csv",
            mime="text/csv",
        )
    with sample_cols[1]:
        if example_xlsx_bytes:
            st.download_button(
                "Last ned eksempel (Excel)",
                data=example_xlsx_bytes,
                file_name="luminoner_eksempel.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        else:
            st.caption(
                f"Excel-eksempel er ikke tilgjengelig i miljøet: {example_xlsx_error or 'ukjent feil'}"
            )


def clamp_fragment(text: str) -> str:
    text = (text or "").strip()
    return text


def normalize_lines(lines: List[str]) -> List[str]:
    out = []
    for ln in lines:
        cleaned = clamp_fragment(ln)
        if not cleaned:
            continue
        out.append(cleaned)
    # fjern duplikater, behold rekkefølge
    return list(dict.fromkeys(out))


def detect_delimiter(raw_text: str, fallback: str = ",") -> str:
    """
    Best-effort deteksjon av tabellskilletegn (komma, semikolon, tab, pipe).
    Bruker csv.Sniffer når mulig og faller ellers tilbake til enkel telling.
    """
    sample = raw_text[:5000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
        if dialect.delimiter:
            return dialect.delimiter
    except csv.Error:
        pass

    counts = {d: raw_text.count(d) for d in [",", ";", "\t", "|"]}
    best = max(counts, key=lambda d: counts[d])
    if counts.get(best, 0) > 0:
        return best
    return fallback


def pick_sample(
    entries: List[Dict[str, Any]], sample_size: int, shuffle: bool = True
) -> List[Dict[str, Any]]:
    """
    Velg et delsett på sample_size rader. Rader beholdes i original rekkefølge.
    """
    total = len(entries)
    if sample_size <= 0:
        return []
    if sample_size >= total:
        return entries
    idx = list(range(total))
    if shuffle:
        random.shuffle(idx)
    chosen = sorted(idx[:sample_size])
    return [entries[i] for i in chosen]


def normalize_list_values(value: Any, max_items: int = 3) -> List[str]:
    """
    Sørger for at listefelt alltid blir en liste med rene strenger (maks max_items).
    """
    if isinstance(value, list):
        items = value
    elif value is None:
        items = []
    else:
        items = [value]
    cleaned: List[str] = []
    for item in items:
        text = str(item).strip()
        if text:
            cleaned.append(text)
        if len(cleaned) >= max_items:
            break
    return cleaned


def normalize_single_value(value: Any) -> str:
    if isinstance(value, list):
        if not value:
            return ""
        value = value[0]
    if value is None:
        return ""
    return str(value).strip()


def build_index_headers(column_count: int) -> List[str]:
    return [f"kol_{i + 1}" for i in range(max(0, column_count))]


input_entries: List[Dict[str, Any]] = []
selected_fragment_column: str | None = None
current_source_headers: List[str] = []
pending_table_rows: List[Dict[str, Any]] = []
pending_table_headers: List[str] = []
pending_table_default_idx = 0

if src == "Lim inn":
    txt = st.text_area(
        "Én forekomst per linje (rå konkordanser)",
        height=220,
        placeholder="fragment 1\nfragment 2\n.",
    )
    if txt:
        normalized = normalize_lines(txt.splitlines())
        if normalized:
            current_source_headers = ["fragment"]
        for idx, frag in enumerate(normalized):
            input_entries.append(
                {
                    "fragment": frag,
                    "source_row": {"fragment": frag},
                    "source_row_index": idx + 1,
                }
            )
else:
    table_has_header = st.checkbox(
        "Første rad i CSV/TSV/Excel er header",
        value=True,
        key="table_has_header",
        help=(
            "Skru av hvis filen mangler header-rad. Da opprettes kolonner som kol_1, kol_2, ..."
        ),
    )
    up = st.file_uploader(
        "Last opp .txt/.csv/.tsv/.xlsx (én forekomst per linje eller kolonne)",
        type=["txt", "csv", "tsv", "xlsx"],
    )
    if up:
        file_bytes = up.getvalue()
        name_lower = up.name.lower()
        is_tsv = name_lower.endswith(".tsv") or name_lower.endswith(".tab")
        is_csv = name_lower.endswith(".csv")
        is_xlsx = name_lower.endswith(".xlsx")
        is_table_file = is_csv or is_tsv or is_xlsx

        if not is_table_file:
            normalized = normalize_lines(
                file_bytes.decode("utf-8", errors="ignore").splitlines()
            )
            if normalized:
                current_source_headers = ["fragment"]
            for idx, frag in enumerate(normalized):
                input_entries.append(
                    {
                        "fragment": frag,
                        "source_row": {"fragment": frag},
                        "source_row_index": idx + 1,
                    }
                )
        else:
            if is_xlsx:
                try:
                    if pd is None:
                        raise RuntimeError("pandas er ikke tilgjengelig i miljøet.")
                    excel_header = 0 if table_has_header else None
                    df = pd.read_excel(
                        io.BytesIO(file_bytes), dtype=str, header=excel_header
                    ).fillna("")
                    if not table_has_header:
                        df.columns = build_index_headers(len(df.columns))
                    rows = df.to_dict(orient="records")
                    headers = [str(c) for c in df.columns.tolist()]
                except Exception as e:
                    st.error(f"Kunne ikke lese Excel-filen: {e}")
                    rows = []
                    headers = []
            else:
                csv_text = file_bytes.decode("utf-8", errors="ignore")
                delimiter = "\t" if is_tsv else detect_delimiter(csv_text, ",")
                if table_has_header:
                    reader = csv.DictReader(io.StringIO(csv_text), delimiter=delimiter)
                    rows = list(reader)
                    headers = reader.fieldnames or []
                else:
                    reader = csv.reader(io.StringIO(csv_text), delimiter=delimiter)
                    raw_rows = list(reader)
                    max_cols = max((len(r) for r in raw_rows), default=0)
                    headers = build_index_headers(max_cols)
                    rows = []
                    for raw in raw_rows:
                        row_obj = {
                            h: (raw[i] if i < len(raw) else "")
                            for i, h in enumerate(headers)
                        }
                        rows.append(row_obj)

            if not headers:
                st.error(
                    "Fant ingen kolonner i filen. Sjekk filformatet eller prøv uten header-rad."
                )
            else:
                current_source_headers = headers
                pending_table_headers = headers
                pending_table_rows = rows
                default_idx = 0
                for i, header in enumerate(headers):
                    if (header or "").strip().lower() == "concordance":
                        default_idx = i
                        break
                pending_table_default_idx = default_idx

st.session_state["last_source_headers"] = current_source_headers

render_section_subtitle("Fragmentkolonne og target-markering")
fragment_cols = st.columns([2.5, 1, 1])
with fragment_cols[0]:
    if pending_table_headers:
        st.caption("Kolonnevalg fylles automatisk fra opplastet fil.")
        selected_fragment_column = st.selectbox(
            "Fragmentkolonne (fra fil)",
            options=pending_table_headers,
            index=min(pending_table_default_idx, len(pending_table_headers) - 1),
            key="fragment_column_select",
            help='Standard er "concordance" hvis den finnes.',
        )
    else:
        st.text_input(
            "Fragmentkolonne (fra fil)",
            value="Last opp CSV/TSV/Excel for å velge kolonne",
            disabled=True,
        )
with fragment_cols[1]:
    target_marker_left_raw = st.text_input(
        "Startmarkør",
        key="target_marker_left_input",
        help="Tegnene rett før målfragmentet (f.eks. <b>).",
        max_chars=20,
    )
with fragment_cols[2]:
    target_marker_right_raw = st.text_input(
        "Sluttmarkør",
        key="target_marker_right_input",
        help="Tegnene rett etter målfragmentet (f.eks. </b>).",
        max_chars=20,
    )
target_marker_left = (target_marker_left_raw or DEFAULT_TARGET_MARKER_LEFT).strip()
target_marker_right = (target_marker_right_raw or DEFAULT_TARGET_MARKER_RIGHT).strip()
st.caption(
    "Marker mål-fragmentet med start/sluttmarkør. Standard matcher DH-lab-formatet med <b>mål</b>."
)
st.caption(
    f"Eksempel på forventet struktur (A = venstre kontekst, B = høyre kontekst): "
    f"A{target_marker_left}klima{target_marker_right}B"
)

if pending_table_rows and selected_fragment_column:
    input_entries.clear()
    for idx, row in enumerate(pending_table_rows):
        row_copy = {h: row.get(h, "") for h in pending_table_headers}
        frag_value = row_copy.get(selected_fragment_column, "")
        cleaned = clamp_fragment(frag_value)
        input_entries.append(
            {
                "fragment": cleaned,
                "source_row": row_copy,
                "source_row_index": idx + 1,
            }
        )

    empty_count = sum(1 for entry in input_entries if not entry["fragment"])
    if empty_count:
        st.warning(
            f"{empty_count} rad(er) mangler tekst i kolonnen «{selected_fragment_column}»."
        )

if selected_fragment_column:
    st.caption(
        f"Fant {len(input_entries)} rader (kolonne «{selected_fragment_column}»). "
        "Originale kolonner beholdes."
    )
else:
    st.caption(
        f"Fant {len(input_entries)} fragmenter (dupl/blanke kuttet)."
    )

# ---------- Instruks (system) ----------
render_section_subtitle("Generert prompt (fra feltoppsett)")
st.caption(
    "Prompten under bygges automatisk fra feltnavn, verdier, felt-kommentarer og tekniske JSON-krav."
)

geo_prompt_text = ""
if geo_fields_active:
    geo_labels_display = ", ".join(f'"{geo["label"]}"' for geo in geo_fields_active)
    geo_prompt_text = (
        f"\nRapporter også geodata for målfragmentet ved å fylle feltene {geo_labels_display}. "
        "Hvis et felt ikke kan bestemmes, skriv «ukjent». Koordinater oppgis som lat,long."
    )

default_user_prompt = f"""
Du annoterer hvert tekstfragment uavhengig.

Fragmentene har formen A{target_marker_left}X{target_marker_right}B der X (mellom
markørene) er målordet du skal beskrive. Bruk konteksten før/etter som støtte,
men alle kategorier skal gjelde selve X.

Bruk kategorifeltene {field_names_display} til å fordele koder per felt.

Hvis ingen kode passer i et felt, bruk verdien "{CATCH_ALL_VALUE}".

Bruk feltet "karakteristikker" til 0–3 korte stikkord som sier noe om fenomenet
du undersøker (f.eks. «personlig», «offentlig», «historisk», «ironisk», osv.).

{geo_prompt_text}
""".strip()

field_prompt_lines: List[str] = []
for c in category_fields:
    prompt_note = normalize_single_value(c.get("prompt_note", ""))
    if prompt_note:
        field_prompt_lines.append(f'- Ekstra føring for "{c["key"]}": {prompt_note}')
field_prompt_text = "\n".join(field_prompt_lines)
if not field_prompt_text:
    field_prompt_text = "- Ingen ekstra feltkommentarer lagt inn."

TASK_PROMPT = (
    default_user_prompt
    + "\n\nEkstra feltkommentarer:\n"
    + field_prompt_text
)

TECH_PROMPT = f"""
Formatkrav (viktig):

- Du får linjer på formen "<id> | <fragment>".
- Du skal behandle hvert fragment uavhengig.
- Fragmentene følger mønsteret A{target_marker_left}X{target_marker_right}B – X
  (mellom markørene) er målfragmentet du klassifiserer.
- Bruk konteksten utenfor markørene som støtte, men feltverdiene skal beskrive X.
{field_rules_text}
- Du skal alltid svare med KUN ÉN gyldig JSON-struktur med nøkkelen "items".
- "items" skal være en liste med objekter på denne formen:

  {{
    "id": <int>,                         // samme id som i input
{json_field_lines}
    "karakteristikker": ["...", "..."],  // 0–3 korte stikkord
    "begrunnelse": "<maks 15 ord>"
  }}

- Ikke legg til annen tekst, forklaringer eller markdown utenfor dette ene JSON-objektet.
- Behold alle id-er du får, og ikke oppfinn nye.
"""

# dette er faktiske systemprompt
prompt = TASK_PROMPT.strip() + "\n\n" + TECH_PROMPT
with st.expander("Forhåndsvis hele prompten (sendes til modellen)", expanded=False):
    st.code(prompt)

# ---------- Sample og kjøring ----------
render_section_title("Modell og kjøring")
model_cols = st.columns([1.3, 1, 1])
model_options = ["gpt-5-mini", "gpt-4o-mini", "gpt-4"]
model_default = st.session_state.get("model_select", "gpt-5-mini")
if model_default not in model_options:
    model_default = "gpt-5-mini"
with model_cols[0]:
    MODEL = st.selectbox(
        "Modell",
        model_options,
        index=model_options.index(model_default),
        key="model_select",
        help="Anbefalt: gpt-5-mini. gpt-4 er dyrere; gpt-4o-mini kan testes.",
    )
with model_cols[1]:
    BATCH_SIZE = int(
        st.number_input(
            "Batch-størrelse",
            min_value=10,
            max_value=500,
            step=10,
            key="batch_size_input",
        )
    )
with model_cols[2]:
    TEMP = float(
        st.slider(
            "Temperature",
            min_value=0.0,
            max_value=1.0,
            step=0.1,
            key="temp_input",
        )
    )
st.caption("Standardoppsett: gpt-5-mini med temperature 1.0.")

render_section_subtitle("Estimat og kjørevalg")
entries_count = len(input_entries)
sample_disabled = entries_count == 0
sample_max_value = entries_count or 1
sample_default = min(10, sample_max_value)
st.caption("Velg enten testkjøring (sample) eller full kjøring av alle rader.")
run_groups = st.columns(2)
with run_groups[0]:
    with st.container(border=True):
        st.markdown("**Testkjøring (sample)**")
        sample_size = st.number_input(
            "Antall linjer i sample",
            min_value=1,
            max_value=sample_max_value,
            value=sample_default,
            step=1,
            disabled=sample_disabled,
            help="Velg hvor mange rader som brukes når du kjører sample.",
        )
        sample_shuffle = st.checkbox(
            "Tilfeldig sample",
            value=True,
            disabled=sample_disabled,
            help="Når aktivert velges samplet tilfeldig før det sorteres.",
        )
        run_sample = st.button(
            "Kjør testsample",
            use_container_width=True,
            disabled=sample_disabled,
        )
with run_groups[1]:
    with st.container(border=True):
        st.markdown("**Full kjøring (alle rader)**")
        st.caption(
            "Kjør hele datasettet med valgt modell og innstillinger."
        )
        run_all = st.button(
            "Kjør alt",
            type="primary",
            use_container_width=True,
            disabled=sample_disabled,
        )

request_stop_after_batch = st.button(
    "Avslutt og vis data så langt",
    use_container_width=True,
    disabled=sample_disabled,
    help="Kjøringen stopper kontrollert etter neste ferdige batch, og du kan analysere resultatene så langt.",
)
if request_stop_after_batch:
    st.session_state["stop_after_batch_requested"] = True
if st.session_state.get("stop_after_batch_requested"):
    st.info("Avslutning er planlagt: kjøringen stopper etter neste batch.")

entries_to_process: List[Dict[str, Any]] | None = None
run_mode = None
if run_all and entries_count:
    entries_to_process = input_entries
    run_mode = "all"
elif run_sample and entries_count:
    sample_target = min(int(sample_size), entries_count)
    entries_to_process = pick_sample(input_entries, sample_target, sample_shuffle)
    run_mode = "sample"

if entries_count:
    approx_all_in = entries_count * 40
    approx_all_out = entries_count * 20
    st.write(
        f"Grovt tokenestimat for **alle data**: "
        f"in ≈ {approx_all_in:,} · out ≈ {approx_all_out:,} · "
        f"total ≈ {approx_all_in + approx_all_out:,}"
    )
    sample_preview = min(int(sample_size), entries_count)
    approx_sample_in = sample_preview * 40
    approx_sample_out = sample_preview * 20
    st.caption(
        f"Et sample på {sample_preview} rader vil bruke ca. "
        f"in ≈ {approx_sample_in:,} · out ≈ {approx_sample_out:,} tokens."
    )
else:
    st.caption("Ingen data ennå – last opp eller lim inn fragmenter for å starte.")

# ---------- Hjelpere ----------
def chunks(xs: List[Any], n: int):
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


@st.cache_data(show_spinner=False)
def _ts():
    return time.strftime("%Y-%m-%dT%H-%M-%S")


def build_records(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # id = lokal rekkefølge i denne kjøringen (beholder original rekkefølge via source_row_index)
    records: List[Dict[str, Any]] = []
    for idx, entry in enumerate(entries):
        records.append(
            {
                "id": idx + 1,
                "fragment": entry.get("fragment", ""),
                "source_row": entry.get("source_row"),
                "source_row_index": entry.get("source_row_index", idx + 1),
            }
        )
    return records


def build_user_msg(batch: List[Dict[str, Any]]) -> str:
    # Modellvennlig, deterministisk struktur
    s = []
    for r in batch:
        s.append(f'{r["id"]} | {r["fragment"]}')
    return "\n".join(s)


def parse_items(raw_text: str) -> List[Dict[str, Any]]:
    """
    Litt mer robust:
    - prøv ren JSON først
    - hvis det feiler, trekk ut første { ... siste } og prøv igjen
    """
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError:
        start = raw_text.find("{")
        end = raw_text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("Kunne ikke finne gyldig JSON-objekt i svaret.")
        data = json.loads(raw_text[start : end + 1])

    items = data.get("items", [])
    if not isinstance(items, list):
        raise ValueError("JSON mangler 'items' som liste.")
    return items


# ---------- Kjøring ----------
to_run_entries = entries_to_process or []
if to_run_entries:
    run_desc = "sample" if run_mode == "sample" else "alle rader"
    st.info(f"Starter kjøring ({run_desc})… Resultater lagres fortløpende i checkpoint-fil.")
    all_rows: List[Dict[str, Any]] = []
    recs = build_records(to_run_entries)
    total = len(recs)

    run_id = make_run_id(run_mode or "run")
    run_jsonl_path, run_meta_path = run_paths(run_id)
    run_jsonl_path.write_text("", encoding="utf-8")
    pending_recs = recs
    done = 0

    run_meta: Dict[str, Any] = {
        "run_id": run_id,
        "status": "running",
        "created_at": _ts_now(),
        "updated_at": _ts_now(),
        "run_mode": run_mode,
        "model": MODEL,
        "temperature": TEMP,
        "batch_size": int(BATCH_SIZE),
        "total_records": total,
        "processed_records": done,
        "jsonl_path": str(run_jsonl_path),
    }
    save_run_meta(run_meta_path, run_meta)
    stop_after_first_batch = bool(st.session_state.get("stop_after_batch_requested"))
    stopped_early = False

    progress = st.progress(0.0)
    status = st.empty()
    progress.progress(done / total if total else 1.0)
    batch_counter = 0
    record_lookup = {rec["id"]: rec for rec in recs}

    def compose_row(
        record_id: int, fragment_value: str, record: Dict[str, Any] | None = None
    ) -> Dict[str, Any]:
        rec = record or record_lookup.get(record_id, {"id": record_id})
        source_row = rec.get("source_row") or {}
        base = dict(source_row)
        idx = rec.get("source_row_index")
        if idx is not None:
            base[META_ROW_INDEX_KEY] = idx
        base[META_RECORD_ID_KEY] = rec.get("id", record_id)
        base["model"] = MODEL
        base["temperature"] = TEMP
        return base

    for batch in chunks(pending_recs, int(BATCH_SIZE)):
        batch_counter += 1
        user_msg = build_user_msg(batch)
        batch_rows: List[Dict[str, Any]] = []

        try:
            r = client.chat.completions.create(
                model=MODEL,
                temperature=TEMP,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": user_msg},
                ],
            )
            text = r.choices[0].message.content.strip()

            try:
                items = parse_items(text)
            except Exception as e_json:
                with st.expander(f"JSON-feil (batch {batch_counter}) – rå svar"):
                    st.code(text)
                raise e_json

            frag_map = {r["id"]: r["fragment"] for r in batch}

            for it in items:
                rid = it.get("id")
                if rid is None:
                    continue
                row = compose_row(rid, frag_map.get(rid, ""))
                row["karakteristikker"] = normalize_list_values(
                    it.get("karakteristikker", [])
                )
                row["begrunnelse"] = normalize_single_value(it.get("begrunnelse", ""))
                for field in category_fields:
                    if field["mode"] == "list":
                        row[field["key"]] = normalize_list_values(
                            it.get(field["key"], [])
                        )
                    else:
                        row[field["key"]] = normalize_single_value(
                            it.get(field["key"], "")
                        )
                for geo in geo_fields_active:
                    row[geo["key"]] = normalize_single_value(it.get(geo["key"], ""))
                all_rows.append(row)
                batch_rows.append(row)

            got_ids = {it.get("id") for it in items}
            for r in batch:
                if r["id"] not in got_ids:
                    row = compose_row(r["id"], r["fragment"], record=r)
                    row["karakteristikker"] = []
                    row["begrunnelse"] = "manglende rad i svar"
                    for field in category_fields:
                        if field["mode"] == "list":
                            row[field["key"]] = ["feil"]
                        else:
                            row[field["key"]] = "feil"
                    for geo in geo_fields_active:
                        row[geo["key"]] = "feil"
                    all_rows.append(row)
                    batch_rows.append(row)

        except Exception as e:
            for r in batch:
                row = compose_row(r["id"], r["fragment"], record=r)
                row["karakteristikker"] = []
                row["begrunnelse"] = str(e)
                for field in category_fields:
                    if field["mode"] == "list":
                        row[field["key"]] = ["feil"]
                    else:
                        row[field["key"]] = "feil"
                for geo in geo_fields_active:
                    row[geo["key"]] = "feil"
                all_rows.append(row)
                batch_rows.append(row)

        append_jsonl_rows(run_jsonl_path, batch_rows)

        done += len(batch)
        progress.progress(done / total)
        status.write(f"Ferdig: {done}/{total}")
        run_meta["processed_records"] = done
        run_meta["updated_at"] = _ts_now()
        save_run_meta(run_meta_path, run_meta)
        if stop_after_first_batch:
            stopped_early = True
            run_meta["status"] = "stopped"
            run_meta["stop_reason"] = "requested_via_button"
            run_meta["updated_at"] = _ts_now()
            save_run_meta(run_meta_path, run_meta)
            break

    if stop_after_first_batch:
        st.session_state["stop_after_batch_requested"] = False

    run_meta["status"] = "stopped" if stopped_early else "completed"
    run_meta["processed_records"] = done
    run_meta["updated_at"] = _ts_now()
    save_run_meta(run_meta_path, run_meta)
    if stopped_early:
        status.write(f"Stoppet tidlig: {done}/{total} (checkpoint: {run_id})")
    else:
        status.write(f"Ferdig: {done}/{total} (checkpoint: {run_id})")

    cleaned_rows = clean_output_rows(all_rows)
    if stopped_early:
        st.warning("Kjøring stoppet tidlig. Du kan analysere resultatene så langt eller gjenoppta senere.")
    else:
        st.success("Kjøring ferdig ✅")
    render_results_panel(
        rows=cleaned_rows,
        category_fields=category_fields,
        geo_fields_active=geo_fields_active,
        source_headers=st.session_state.get("last_source_headers", []) or [],
        run_mode=run_mode,
        run_id=run_id,
        checkpoint_path=run_jsonl_path,
    )
