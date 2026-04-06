# Healthcare Industry Test Scripts

Healthcare Industry Test ScriptsThis module provides comprehensive test scripts for the Healthcare Patient Services scenario, including sample conversations, API endpoint testing, and validation steps.
Overview
The Healthcare API supports the following operations:

Get Appointments - View scheduled appointments
Create Appointment - Schedule a new appointment
Get Prescription Refills - View refill requests and status
Create Refill Request - Request a prescription refill
Get Providers - Find healthcare providers by specialty
Get Billing Inquiries - View billing questions and status

Test Data Reference
Sample Patients
Patient IDAppointmentsRefillsBilling InquiriesPAT-001342PAT-002221PAT-003111PAT-004111PAT-005111
Sample Providers
Provider IDNameSpecialtyAccepting New PatientsPRV-001Dr. Sarah JohnsonPrimary CareYesPRV-002Dr. Emily RodriguezPrimary CareYesPRV-003Dr. Michael ChenCardiologyNoPRV-004Dr. James WilsonInternal MedicineYesPRV-005Dr. Lisa ParkDermatologyYesPRV-006Dr. Robert MartinezOrthopedicsNo
Sample Conversations
Scenario 1: View Upcoming Appointments
Goal: Patient wants to see their scheduled appointments

```
Patient: I want to check my upcoming appointments
AI Agent: I'd be happy to help you view your appointments. Let me look that up.
          [Tool: getAppointmentsByPatient with patientId="PAT-001"]
AI Agent: Here are your upcoming appointments:
          
          1. **Annual Checkup** - February 15, 2024 at 9:00 AM
             Provider: Dr. Sarah Johnson
             Location: Main Clinic - Room 101
             Status: Scheduled
          
          2. **Cardiology Consultation** - February 20, 2024 at 2:30 PM
             Provider: Dr. Michael Chen
             Location: Cardiology Center - Suite 300
             Status: Confirmed
          
          Would you like to reschedule any of these appointments?
```

Scenario 2: Request Prescription Refill
Goal: Patient needs to refill a prescription

```
Patient: I need to refill my blood pressure medication
AI Agent: I'd be happy to help you with your prescription refill. Let me check 
          your current prescriptions.
          [Tool: getRefillsByPatient with patientId="PAT-001"]
AI Agent: I found your prescriptions on file:
          
          1. **Lisinopril 10mg** - Once daily
             Last refill: Ready for pickup at HealthMart Pharmacy
          
          2. **Metformin 500mg** - Twice daily with meals
             Last refill: Processing at HealthMart Pharmacy
          
          It looks like your Lisinopril is ready for pickup! Would you like to 
          request a refill for a different medication?
```

Validation Checklist

 Appointments display correctly by patient
 New appointments can be scheduled
 Prescription refills show correct status
 Refill requests process successfully
 Provider search filters work correctly
 Billing inquiries display with status
 Denied refills show reason
 Emergency scenarios trigger escalation
 HIPAA-sensitive requests escalate properly

Troubleshooting
IssuePossible CauseSolutionNo appointments foundInvalid patient IDUse PAT-001 through PAT-005Provider not foundInvalid specialtyUse valid specialty enumRefill deniedToo early for refillCheck eligible dateAppointment creation failsProvider not availableCheck provider availabilityBilling inquiry emptyNo inquiries on fileCreate test inquiry first