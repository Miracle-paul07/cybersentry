
import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

from backend import (
    generate_reports,
    get_pipeline,
    required_columns,
    run_analysis,
)
from report_export import report_to_pdf, report_to_txt
from risk import get_risk_level

# --------------------------------------------------
# Page configuration
# --------------------------------------------------
st.set_page_config(
    page_title="CyberSentry",
    page_icon="🛡️",
    layout="wide",
)

# Hide Streamlit's own toolbar, Deploy button, main menu and footer
st.html(
    """
    <style>
    header[data-testid="stHeader"] {
        background: transparent;
    }
    [data-testid="stToolbar"],
    [data-testid="stAppDeployButton"],
    [data-testid="stMainMenu"],
    [data-testid="stDecoration"],
    [data-testid="stStatusWidget"],
    #MainMenu,
    footer {
        display: none !important;
        visibility: hidden !important;
    }
    </style>
    """
)

st.title("🛡️ CyberSentry")
st.caption("Detect. Understand. Respond.")

PAGES = [
    "Upload Network Data",
    "Security Overview",
    "Threat Detection",
    "Threat Analysis",
    "Incident Reports",
]

# --------------------------------------------------
# Helper functions
# --------------------------------------------------
def show_risk_color(value):
    """Apply readable colors to risk levels in the threat table."""
    colors = {
        "Low": "background-color: #d1fae5; color: #065f46",
        "Medium": "background-color: #fef3c7; color: #92400e",
        "High": "background-color: #fed7aa; color: #9a3412",
        "Critical": "background-color: #fee2e2; color: #991b1b",
    }
    return colors.get(value, "")


def show_report_warnings():
    for message in st.session_state.get("report_warnings", []):
        st.warning(message, icon=":material/warning:")


# --------------------------------------------------
# Sidebar navigation
# --------------------------------------------------
has_results = "analysis_results" in st.session_state

# Switch page after a finished analysis (must happen before the radio exists)
if "next_page" in st.session_state:
    st.session_state["page"] = st.session_state.pop("next_page")
elif "page" not in st.session_state:
    st.session_state["page"] = PAGES[1] if has_results else PAGES[0]

st.sidebar.title("🛡️ CyberSentry")
st.sidebar.caption("Detect. Understand. Respond.")
if has_results:
    st.sidebar.caption(
        f"Analysed file: {st.session_state.get('uploaded_name', 'uploaded CSV')}"
    )

page = st.sidebar.radio("Navigate", PAGES, key="page")

st.sidebar.divider()
st.sidebar.caption("AI-assisted analysis for human security analysts.")

# Every page except Upload needs analysis results
if page != "Upload Network Data" and not has_results:
    st.header(page)
    st.info(
        "Upload a CSV on the Upload page to start.",
        icon=":material/upload_file:",
    )
    st.stop()

if has_results:
    df = st.session_state["analysis_results"].copy()
    df["risk_level"] = df.apply(get_risk_level, axis=1)


# --------------------------------------------------
# 1. Upload Network Data
# --------------------------------------------------
if page == "Upload Network Data":
    st.header("Upload Network Data")
    st.write(
        "Upload a CICFlowMeter-format CSV (same columns as CIC-IDS2017). "
        "CyberSentry runs the detection models on every row and writes an "
        "incident report for each attack type it finds."
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
                uploaded_df.columns = uploaded_df.columns.str.strip()

                if uploaded_df.empty:
                    st.error("The uploaded CSV contains no rows.")
                else:
                    missing_columns = [
                        column
                        for column in required_columns()
                        if column not in uploaded_df.columns
                    ]

                    if missing_columns:
                        st.error(
                            "The CSV is missing required columns: "
                            + ", ".join(missing_columns)
                        )
                    else:
                        st.success(
                            f"CSV validated: {len(uploaded_df):,} rows."
                        )
                        st.dataframe(uploaded_df.head(10))

                        if st.button("Run Analysis", type="primary"):
                            try:
                                with st.spinner("Running detection models..."):
                                    results, cleaning_report = run_analysis(
                                        uploaded_df
                                    )

                                progress_bar = st.progress(
                                    0.0, text="Writing incident reports..."
                                )

                                def update_progress(done, total, attack):
                                    text = (
                                        f"Writing incident report for {attack} "
                                        f"({done + 1}/{total})..."
                                        if attack
                                        else "Incident reports ready."
                                    )
                                    progress_bar.progress(
                                        done / total if total else 1.0,
                                        text=text,
                                    )

                                reports, report_warnings = generate_reports(
                                    results, progress=update_progress
                                )

                                st.session_state["analysis_results"] = results
                                st.session_state["cleaning_report"] = (
                                    cleaning_report
                                )
                                st.session_state["incident_reports"] = reports
                                st.session_state["report_warnings"] = (
                                    report_warnings
                                )
                                st.session_state["uploaded_name"] = (
                                    uploaded_file.name
                                )
                                st.session_state["next_page"] = (
                                    "Security Overview"
                                )
                                st.rerun()

                            except Exception as error:
                                st.error(f"Analysis failed: {error}")

            except (pd.errors.ParserError, UnicodeDecodeError) as error:
                st.error(f"Could not read this CSV: {error}")
            except Exception as error:
                st.error(f"Upload validation failed: {error}")

    if has_results:
        report = st.session_state["cleaning_report"]
        st.subheader("Latest Analysis")
        st.caption(f"File: {st.session_state.get('uploaded_name', '')}")
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Rows Uploaded", f"{report['rows_in']:,}")
        col2.metric("Invalid Rows Dropped", f"{report['rows_dropped_invalid']:,}")
        col3.metric("Rows Analysed", f"{report['rows_analysed']:,}")
        col4.metric("Threats Detected", f"{report['threats_detected']:,}")
        show_report_warnings()
    else:
        # Load the models while the user picks a file
        get_pipeline()


# --------------------------------------------------
# 2. Security Overview
# --------------------------------------------------
elif page == "Security Overview":
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
        st.plotly_chart(fig)

    with right:
        st.subheader("Attacks by Type")
        attacks = df.loc[
            df["is_threat"],
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
            st.plotly_chart(fig)
        else:
            st.info("No attacks were detected in this file.")

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
        st.plotly_chart(fig)
        st.caption(
            "Only flows flagged by Stage 1 get a Stage 2 confidence score."
        )
    else:
        st.info("No confidence scores are available.")


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

    risk_options = ["All", "Medium", "High", "Critical"]
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
        st.dataframe(styled_table, hide_index=True)
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
            st.dataframe(threats.head(100), hide_index=True)
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
        df.loc[df["is_threat"], "attack_type"].unique().tolist()
    )

    if not attack_types:
        st.info("No attacks were detected in this file.")
    else:
        selected_analysis_attack = st.selectbox(
            "Select an attack type",
            attack_types,
        )

        attack_df = df.loc[
            df["attack_type"] == selected_analysis_attack
        ]
        benign_df = df.loc[df["attack_type"] == "BENIGN"]

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
            st.plotly_chart(fig)
        else:
            st.info("No Stage 1 scores are available for this attack.")

        st.subheader(f"{selected_analysis_attack} vs BENIGN Feature Averages")

        # Model input features only (no result columns, no labels)
        numeric_features = [
            column
            for column in required_columns()
            if column in df.columns
        ]

        if benign_df.empty:
            st.info("BENIGN rows are required for feature comparison.")
        else:
            attack_means = attack_df[numeric_features].mean()
            benign_means = benign_df[numeric_features].mean()

            # Default to the features that differ most from normal traffic,
            # among those a log scale can draw (both averages above 0)
            drawable = (attack_means > 0) & (benign_means > 0)
            difference = (
                np.log10(attack_means[drawable]) - np.log10(benign_means[drawable])
            ).abs().drop("Destination Port", errors="ignore")
            default_features = (
                difference.sort_values(ascending=False).head(5).index.tolist()
            )

            selected_features = st.multiselect(
                "Choose network features",
                numeric_features,
                default=default_features,
                key=f"features_{selected_analysis_attack}",
            )

            if selected_features:
                comparison_df = pd.DataFrame({
                    f"{selected_analysis_attack} Mean": attack_means[
                        selected_features
                    ],
                    "BENIGN Mean": benign_means[selected_features],
                }).dropna()

                if not comparison_df.empty:
                    comparison_df.index.name = "Feature"
                    st.dataframe(comparison_df)

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
                        log_y=True,
                        title=(
                            f"Average Feature Values: "
                            f"{selected_analysis_attack} vs BENIGN (log scale)"
                        ),
                    )
                    fig.update_layout(xaxis_tickangle=-35)
                    st.plotly_chart(fig)
                    if (chart_df["Average Value"] <= 0).any():
                        st.caption(
                            "Zero or negative averages cannot be drawn on a "
                            "log scale; see the table for exact values."
                        )
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
    show_report_warnings()

    reports = st.session_state.get("incident_reports", {})

    if not reports:
        st.info("No attacks were detected, so there are no incident reports.")
    else:
        selected_attack = st.selectbox(
            "Select an attack type",
            list(reports.keys()),
        )
        report = reports[selected_attack]
        file_stem = f"{report['incident_id']}"

        col1, col2 = st.columns(2)
        with col1:
            try:
                pdf_bytes = report_to_pdf(
                    report["markdown"],
                    report["incident_id"],
                    report["severity"],
                    selected_attack,
                )
                st.download_button(
                    "Download PDF",
                    data=pdf_bytes,
                    file_name=f"{file_stem}.pdf",
                    mime="application/pdf",
                    icon=":material/picture_as_pdf:",
                    width="stretch",
                )
            except Exception as error:
                st.error(f"Could not create the PDF: {error}")
        with col2:
            st.download_button(
                "Download TXT",
                data=report_to_txt(
                    report["markdown"],
                    report["incident_id"],
                    report["severity"],
                    selected_attack,
                ),
                file_name=f"{file_stem}.txt",
                mime="text/plain",
                icon=":material/description:",
                width="stretch",
            )

        st.caption(f"Narrative source: {report['source']}")
        with st.container(border=True):
            st.markdown(report["markdown"])

st.divider()
st.caption(
    "CyberSentry assists human security analysts; it does not replace them."
)
