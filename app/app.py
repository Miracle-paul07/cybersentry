
import re
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

from backend import (
    load_demo_results,
    load_demo_flows,
    run_analysis,
)

# --------------------------------------------------
# Page configuration
# --------------------------------------------------
st.set_page_config(
    page_title="CyberSentry",
    page_icon="🛡️",
    layout="wide",
)

st.title("🛡️ CyberSentry")
st.caption("Detect. Understand. Respond.")

# --------------------------------------------------
# Helper functions
# --------------------------------------------------
def to_bool(value):
    """Safely convert CSV boolean values to True or False."""
    if pd.isna(value):
        return False
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes"}
    return bool(value)


def get_risk_level(row):
    """Derive a risk level from attack type, confidence and review status."""
    attack = str(row["attack_type"]).strip().upper()
    confidence = row["confidence"]
    needs_review = to_bool(row["needs_review"])

    if attack == "BENIGN":
        return "Low"
    if needs_review:
        return "Critical"
    if pd.notna(confidence) and confidence >= 0.90:
        return "Critical"
    if pd.notna(confidence) and confidence >= 0.70:
        return "High"
    return "Medium"


def normalize_name(value):
    """Normalize names for matching attack types and report filenames."""
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def show_risk_color(value):
    """Apply readable colors to risk levels in the threat table."""
    colors = {
        "Low": "background-color: #d1fae5; color: #065f46",
        "Medium": "background-color: #fef3c7; color: #92400e",
        "High": "background-color: #fed7aa; color: #9a3412",
        "Critical": "background-color: #fee2e2; color: #991b1b",
    }
    return colors.get(value, "")


# --------------------------------------------------
# Load saved demo results through the backend
# --------------------------------------------------
try:
    if "analysis_results" in st.session_state:
        df = st.session_state["analysis_results"].copy()
        results_source = "Latest demo analysis"
    else:
        df = load_demo_results()
        results_source = "Saved demo results"

    required_result_columns = [
        "is_threat",
        "needs_review",
        "attack_type",
        "confidence",
        "stage1_score",
    ]

    missing_result_columns = [
        column
        for column in required_result_columns
        if column not in df.columns
    ]

    if missing_result_columns:
        st.error(
            "Results are missing required columns: "
            + ", ".join(missing_result_columns)
        )
        st.stop()

    df["confidence"] = pd.to_numeric(
        df["confidence"], errors="coerce"
    )
    df["stage1_score"] = pd.to_numeric(
        df["stage1_score"], errors="coerce"
    )
    df["is_threat"] = df["is_threat"].apply(to_bool)
    df["needs_review"] = df["needs_review"].apply(to_bool)
    df["attack_type"] = df["attack_type"].fillna("Unknown").astype(str)

    df["risk_level"] = df.apply(get_risk_level, axis=1)

except Exception as error:
    st.error(f"Could not load dashboard results: {error}")
    st.stop()


# --------------------------------------------------
# Sidebar navigation
# --------------------------------------------------
st.sidebar.title("🛡️ CyberSentry")
st.sidebar.caption("Detect. Understand. Respond.")
st.sidebar.caption(f"Data source: {results_source}")

page = st.sidebar.radio(
    "Navigate",
    [
        "Security Overview",
        "Upload Network Data",
        "Threat Detection",
        "Threat Analysis",
        "Incident Reports",
    ],
)

st.sidebar.divider()
st.sidebar.caption("AI-assisted analysis for human security analysts.")


# --------------------------------------------------
# 1. Security Overview
# --------------------------------------------------
if page == "Security Overview":
    st.header("Security Overview")

    total_flows = len(df)
    threat_count = int(df["is_threat"].sum())
    threat_percentage = (
        threat_count / total_flows * 100 if total_flows else 0
    )
    review_count = int(df["needs_review"].sum())

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Network Flows", f"{total_flows:,}")
    col2.metric("Detected Threats", f"{threat_count:,}")
    col3.metric("Threat Percentage", f"{threat_percentage:.1f}%")
    col4.metric("Flows Needing Review", f"{review_count:,}")

    left, right = st.columns(2)

    with left:
        st.subheader("Risk Level Breakdown")
        risk_counts = (
            df["risk_level"]
            .value_counts()
            .reindex(
                ["Low", "Medium", "High", "Critical"],
                fill_value=0,
            )
            .rename_axis("Risk Level")
            .reset_index(name="Number of Flows")
        )

        fig = px.bar(
            risk_counts,
            x="Risk Level",
            y="Number of Flows",
            color="Risk Level",
            category_orders={
                "Risk Level": ["Low", "Medium", "High", "Critical"]
            },
            color_discrete_map={
                "Low": "#10b981",
                "Medium": "#f59e0b",
                "High": "#f97316",
                "Critical": "#ef4444",
            },
        )
        st.plotly_chart(fig, use_container_width=True)

    with right:
        st.subheader("Attacks by Type")
        attacks = df.loc[
            df["attack_type"].str.upper() != "BENIGN",
            "attack_type",
        ].value_counts().rename_axis("Attack Type").reset_index(
            name="Number of Flows"
        )

        if not attacks.empty:
            fig = px.bar(
                attacks.sort_values("Number of Flows"),
                x="Number of Flows",
                y="Attack Type",
                orientation="h",
                color="Number of Flows",
                color_continuous_scale="Reds",
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No attack types were found.")

    st.subheader("Model Confidence Distribution")
    confidence_scores = df["confidence"].dropna()

    if not confidence_scores.empty:
        fig = px.histogram(
            confidence_scores,
            nbins=10,
            labels={"value": "Confidence", "count": "Number of Flows"},
        )
        fig.update_layout(
            xaxis_title="Model Confidence",
            yaxis_title="Number of Flows",
            showlegend=False,
        )
        st.plotly_chart(fig, use_container_width=True)
        st.caption("Rows with missing confidence scores are excluded.")
    else:
        st.info("No confidence scores are available.")


# --------------------------------------------------
# 2. Upload Network Data
# --------------------------------------------------
elif page == "Upload Network Data":
    st.header("Upload Network Data")
    st.write(
        "Upload a CSV containing the required network-flow feature columns."
    )
    st.info(
        "Demo mode: Run Analysis currently displays the saved demo results. "
        "It does not run a new prediction on the uploaded rows."
    )

    uploaded_file = st.file_uploader(
    "Choose a CSV file (maximum 20 MB)",
    type=["csv"],
    )

    if uploaded_file is not None:
        if uploaded_file.size > 20 * 1024 * 1024:
            st.error("File is too large. Please upload a file under 20 MB.")
        else:
            try:
                uploaded_df = pd.read_csv(uploaded_file)

                if uploaded_df.empty:
                    st.error("The uploaded CSV contains no rows.")
                else:
                    required_columns = set(load_demo_flows().columns)
                    missing_columns = sorted(
                        required_columns - set(uploaded_df.columns)
                    )

                    if missing_columns:
                        st.error(
                            "The CSV is missing required columns: "
                            + ", ".join(missing_columns)
                        )
                    else:
                        st.success(
                            f"CSV validated: {len(uploaded_df):,} rows."
                        )
                        st.dataframe(
                            uploaded_df.head(10),
                            use_container_width=True,
                        )

                        if st.button(
                            "Run Analysis",
                            type="primary",
                        ):
                            try:
                                with st.spinner("Loading demo results..."):
                                    results, cleaning_report = run_analysis(
                                        uploaded_df
                                    )

                                st.session_state["analysis_results"] = results
                                st.session_state["cleaning_report"] = (
                                    cleaning_report
                                )
                                st.success("Demo results loaded successfully.")
                                st.rerun()

                            except Exception as error:
                                st.error(f"Analysis failed: {error}")

            except (pd.errors.ParserError, UnicodeDecodeError) as error:
                st.error(f"Could not read this CSV: {error}")
            except Exception as error:
                st.error(f"Upload validation failed: {error}")

    if "cleaning_report" in st.session_state:
        st.subheader("Latest Demo Run")
        st.json(st.session_state["cleaning_report"])


# --------------------------------------------------
# 3. Threat Detection
# --------------------------------------------------
elif page == "Threat Detection":
    st.header("Threat Detection")
    st.caption("Filter detected threats and inspect their risk levels.")

    threats = df.loc[df["is_threat"]].copy()

    col1, col2, col3 = st.columns(3)

    attack_options = ["All"] + sorted(
        threats["attack_type"].unique().tolist()
    )
    with col1:
        selected_attack = st.selectbox(
            "Attack Type",
            attack_options,
        )

    risk_options = ["All", "Low", "Medium", "High", "Critical"]
    with col2:
        selected_risk = st.selectbox(
            "Risk Level",
            risk_options,
        )

    review_options = ["All", "Needs review", "No review needed"]
    with col3:
        selected_review = st.selectbox(
            "Review Status",
            review_options,
        )

    if selected_attack != "All":
        threats = threats.loc[
            threats["attack_type"] == selected_attack
        ]

    if selected_risk != "All":
        threats = threats.loc[
            threats["risk_level"] == selected_risk
        ]

    if selected_review == "Needs review":
        threats = threats.loc[threats["needs_review"]]
    elif selected_review == "No review needed":
        threats = threats.loc[~threats["needs_review"]]

    col1, col2 = st.columns(2)
    col1.metric("Filtered Threats", f"{len(threats):,}")
    col2.metric(
        "Threats Needing Review",
        f"{int(threats['needs_review'].sum()):,}",
    )

    display_columns = [
        "attack_type",
        "risk_level",
        "confidence",
        "stage1_score",
        "needs_review",
    ]

    if not threats.empty:
        styled_table = threats[display_columns].style.map(
            show_risk_color,
            subset=["risk_level"],
        )
        st.dataframe(
            styled_table,
            use_container_width=True,
            hide_index=True,
        )
    else:
        st.info("No threats match the selected filters.")

    st.download_button(
        "Download Filtered Threats",
        data=threats[display_columns].to_csv(index=False),
        file_name="cybersentry_threats.csv",
        mime="text/csv",
    )

    with st.expander("View raw network features"):
        if not threats.empty:
            st.dataframe(
                threats.head(100),
                use_container_width=True,
                hide_index=True,
            )
            st.caption("Showing up to 100 filtered threat rows.")
        else:
            st.info("No filtered threat rows to display.")


# --------------------------------------------------
# 4. Threat Analysis
# --------------------------------------------------
elif page == "Threat Analysis":
    st.header("Threat Analysis")
    st.caption("Explore attack patterns and compare them with BENIGN traffic.")

    attack_types = sorted(
        df.loc[
            df["attack_type"].str.upper() != "BENIGN",
            "attack_type",
        ].unique().tolist()
    )

    if not attack_types:
        st.info("No attack types are available for analysis.")
    else:
        selected_analysis_attack = st.selectbox(
            "Select an attack type",
            attack_types,
        )

        attack_df = df.loc[
            df["attack_type"] == selected_analysis_attack
        ]
        benign_df = df.loc[df["attack_type"].str.upper() == "BENIGN"]

        average_confidence = attack_df["confidence"].mean()

        col1, col2, col3 = st.columns(3)
        col1.metric("Selected Attack", selected_analysis_attack)
        col2.metric("Number of Flows", f"{len(attack_df):,}")
        col3.metric(
            "Average Confidence",
            f"{average_confidence:.2%}"
            if pd.notna(average_confidence)
            else "N/A",
        )

        st.subheader("Stage 1 Score Distribution")
        scores = attack_df["stage1_score"].dropna()

        if not scores.empty:
            fig = px.histogram(
                scores,
                nbins=10,
                labels={"value": "Stage 1 Score", "count": "Number of Flows"},
            )
            fig.update_layout(
                xaxis_title="Stage 1 Anomaly Score",
                yaxis_title="Number of Flows",
                showlegend=False,
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No Stage 1 scores are available for this attack.")

        st.subheader("Attack Features vs BENIGN Averages")

        excluded_columns = {
            "stage1_score",
            "confidence",
            "is_threat",
            "needs_review",
            "suspicious",
            "attack_type",
            "risk_level",
        }

        numeric_features = [
            column
            for column in df.select_dtypes(include="number").columns
            if column not in excluded_columns
        ]

        if benign_df.empty:
            st.info("BENIGN rows are required for feature comparison.")
        elif not numeric_features:
            st.info("No numeric network features are available.")
        else:
            selected_features = st.multiselect(
                "Choose network features",
                numeric_features,
                default=numeric_features[:5],
            )

            if selected_features:
                attack_means = attack_df[selected_features].mean()
                benign_means = benign_df[selected_features].mean()

                comparison_df = pd.DataFrame({
                    "Attack Mean": attack_means,
                    "BENIGN Mean": benign_means,
                }).dropna()

                if not comparison_df.empty:
                    comparison_df.index.name = "Feature"
                    st.dataframe(
                        comparison_df,
                        use_container_width=True,
                    )

                    chart_df = comparison_df.reset_index().melt(
                        id_vars="Feature",
                        var_name="Traffic Type",
                        value_name="Average Value",
                    )

                    fig = px.bar(
                        chart_df,
                        x="Feature",
                        y="Average Value",
                        color="Traffic Type",
                        barmode="group",
                        title="Average Feature Values: Attack vs BENIGN",
                    )
                    fig.update_layout(xaxis_tickangle=-35)
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.info("No valid feature averages could be calculated.")
            else:
                st.info("Select at least one feature to compare.")


# --------------------------------------------------
# 5. Incident Reports
# --------------------------------------------------
elif page == "Incident Reports":
    st.header("Incident Reports")
    st.caption(
        "Reports are AI-assisted evidence summaries and require human review."
    )

    reports_dir = (
        Path(__file__).resolve().parent.parent
        / "reports"
        / "samples"
    )

    if not reports_dir.is_dir():
        st.warning("The reports/samples folder was not found.")
    else:
        report_files = sorted(reports_dir.glob("*.md"))

        if not report_files:
            st.info("No Markdown incident reports were found.")
        else:
            attack_types = sorted(
                df.loc[
                    df["attack_type"].str.upper() != "BENIGN",
                    "attack_type",
                ].unique().tolist()
            )

            report_lookup = {
                normalize_name(file.stem): file
                for file in report_files
            }

            matched_attacks = {
                attack: report_lookup[normalize_name(attack)]
                for attack in attack_types
                if normalize_name(attack) in report_lookup
            }

            if matched_attacks:
                selected_attack = st.selectbox(
                    "Select an attack type",
                    list(matched_attacks.keys()),
                )
                selected_report_path = matched_attacks[selected_attack]
            else:
                st.info(
                    "No report filenames exactly match the detected attack "
                    "type names. You can select an available report below."
                )
                selected_report_path = st.selectbox(
                    "Select a saved report",
                    report_files,
                    format_func=lambda file: file.stem,
                )

            report_text = selected_report_path.read_text(
                encoding="utf-8"
            )

            st.markdown(report_text)

            st.download_button(
                "Download Incident Report",
                data=report_text,
                file_name=selected_report_path.name,
                mime="text/markdown",
            )

st.divider()
st.caption(
    "CyberSentry assists human security analysts; it does not replace them."
)
