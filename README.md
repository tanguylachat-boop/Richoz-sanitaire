# ICS Chauffage & Sanitaire - Workflows n8n V1

> **Version:** 1.0 (V1 Simple)
> **Objectif:** Demo fonctionnelle avec Google Sheets

## Structure du projet

```
n8n-workflows/
  V1_EMAIL_Inbox.json              # Email regie -> Sheet
  V1_PLANNING_Calendar.json        # Calendar -> Interventions
  V1_PLANNING_SendConfirmation.json # Confirmation regie
  V1_DAILY_Schedule.json           # Planning quotidien techniciens
  V1_REPORT_Submit.json            # Webhook rapport
  V1_REPORT_Classify.json          # Classification IA
  V1_INVOICE_Generate.json         # Generation facture

google-sheets/
  structure.md                     # Structure des onglets
```

## Prerequisites

### Credentials n8n

| Nom | Type |
|-----|------|
| Gmail_ICS | Gmail OAuth2 |
| Google_Sheets_ICS | Google Sheets API |
| Google_Calendar_ICS | Google Calendar API |
| OpenAI_ICS | OpenAI API Key (GPT-4) |

### Google Sheet

Creer un Google Sheet avec les onglets decrits dans `google-sheets/structure.md`

## Deploiement

1. Creer Google Sheet avec structure (voir `google-sheets/structure.md`)
2. Configurer credentials n8n
3. Importer workflows dans cet ordre:
   - V1_EMAIL_Inbox
   - V1_PLANNING_Calendar
   - V1_PLANNING_SendConfirmation
   - V1_DAILY_Schedule
   - V1_REPORT_Submit
   - V1_REPORT_Classify
   - V1_INVOICE_Generate
4. Remplacer `[SHEET_ID]` par l'ID de votre Google Sheet dans chaque workflow
5. Tester chaque workflow individuellement
6. Activer tous les triggers

## Conventions

- **Regie**: Mot-cle dans le titre Calendar: `[FONCIA]`, `[NAEF]`, `[SIPA]`
- **Technicien**: Email avec `@ics.ch` dans attendees du Calendar
- **Dates**: Format ISO 8601
- **Champs vides**: `""` jamais null

## Tests

| # | Test | Resultat attendu |
|---|------|------------------|
| 1 | Email foncia.com | Ligne avec regie_name |
| 2 | Event [FONCIA] + attendee | Intervention creee |
| 3 | Event avec regie_email | Confirmation envoyee |
| 4 | Event sans regie | Pas de confirmation |
| 5 | POST rapport | Ligne reports |
| 6 | Rapport "robinet change" | FACTURABLE |
| 7 | Rapport "rien trouve" | NON_FACTURABLE |
| 8 | Rapport facturable | invoice_payload rempli |
