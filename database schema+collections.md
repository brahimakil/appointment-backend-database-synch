Healthcare Platform - Project Documentation

This document outlines the data structure and core logic for the healthcare platform. It details the Firestore collections, the schema for each, and the primary user scenarios for Admins, Doctors, and Patients.

Table of Contents

Data Model: Firestore Collections

1. appointments

2. availability

3. chats

4. notifications

5. specialities

6. users

User Role: admin

User Role: doctor

User Role: patient

User Roles & Scenarios

Admin Scenario

Doctor Scenario

Patient Scenario

Core System Logic & Constraints

Data Model: Firestore Collections

The project utilizes the following Firestore collections to manage data.

1. appointments

Stores all information related to scheduled appointments between doctors and patients.

Example Document:

Generated json
{
  "attachedDocuments": [
    {
      "file": "(base64 url document /image etc)"
    }
  ],
  "hour": 10,
  "notes": "ated complications may be contributing factors to consider. Treatment and Follow-up: - Treatment plan dependent on diagnosis after history, examination, and investigations. - Emphasize importance of adherence to diabetes management plan. - Schedule follow-up appointment for review of investigations and treatment plan. - Refer to specialist as needed depending on diagnosis. Red Flags: - Uncontrolled diabetes. - Symptoms suggestive of acute diabetes complications (DKA, HHS). - Allergic reaction symptoms. - Based on specific findings related to \"asdads\". DOCTORNOTESEND PATIENTNOTESSTART YOUR APPOINTPOINTMENT INFORMATION Hello ibrahim, Here's a summary of your upcoming appointment on Tuesday, July 1, 2025, at 10:00. What We'll Discuss: - The main reason for your visit (\"asdads\") needs to be discussed to understand your health concerns. Please be ready to explain your symptoms and what you are experiencing. Important Information You Provided: - You have diabetes. We will talk about how you are managing your diabetes and if you have any questions or concerns. It's important to keep your blood sugar in a healthy range. - You are allergic to peanuts. Please be careful to avoid peanuts and always carry your allergy medication if prescribed. - You are currently taking Panadol. Please let us know why you are taking this medication and how often you take it. - Your weight is a little higher than recommended for your height. We can discuss healthy eating and exercise tips to help you manage your weight. Next Steps: - Please arrive on time for your appointment. - Be prepared to discuss your symptoms and health history in detail. - We may order some blood tests to check your overall health, especially related to your diabetes. - We'll work together to create a plan to address your health concerns and manage your diabetes. Important Reminders: - If you have any questions before your appointment, please call the office. - Remember to bring a list of all your medications with you. We look forward to seeing you soon! PATIENTNOTESEND ",
  "patientId": "w270t9IsmyXNqEuVcmMQw6vZksZ2",
  "patientName": "ibrahim akil patient",
  "reason": "asdads",
  "status": "upcoming",
  "time": "10:00",
  "updatedAt": "2025-07-02T00:21:26.894Z"
}

2. availability

Stores the weekly working hours for each doctor. The schedule map contains days of the week, with each day being an array of 24 booleans representing the hours (0-23). true indicates availability.

Example Document:

Generated json
{
  "doctorId": "C3oZaLKsOxPXQzQAxQC11Bmez5i1",
  "schedule": {
    "Friday": [false, false, false, false, false, false, false, false, false, true, true, true, true, true, true, true, true, false, false, false, false, false, false, false],
    "Monday": [false, false, false, false, false, false, false, false, false, true, true, true, true, true, true, true, true, false, false, false, false, false, false, false],
    "Saturday": [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    "Sunday": [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    "Thursday": [false, false, false, false, false, false, false, false, false, true, true, true, true, true, true, true, true, false, false, false, false, false, false, false],
    "Tuesday": [false, false, false, false, false, false, false, false, false, true, true, true, true, true, true, true, true, false, false, false, false, false, false, false],
    "Wednesday": [false, false, false, false, false, false, false, false, false, true, true, true, true, true, true, true, true, false, false, false, false, false, false, false]
  },
  "updatedAt": "2025-06-04T07:05:23.730Z"
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Json
IGNORE_WHEN_COPYING_END
3. chats

Stores message history between patients and doctors (including AI doctors).

Example Document:

Generated json
{
  "doctorId": "general-ai-doctor",
  "patientId": "mDo9YPAnj8RDdiZqfpqfnzSyfVF3",
  "sender": "ai",
  "text": "The Allied Powers won World War II. The major Allied Powers were: * **Great Britain (United Kingdom):** Led by Prime Minister Winston Churchill for most of the war. * **The United States of America:** Led by President Franklin D. Roosevelt until his death in 1945, then by President Harry S. Truman. * **The Soviet Union:** Led by Premier Joseph Stalin. * **China (Republic of China):** Led by Generalissimo Chiang Kai-shek. These were the main players, but many other countries also contributed to the Allied effort, including France, Canada, Australia, Poland, and many more. They defeated the Axis Powers, which were primarily: * **Nazi Germany:** Led by Adolf Hitler. * **Imperial Japan:** Led by Emperor Hirohito, with military leadership from figures like Hideki Tojo. * **Italy:** Led by Benito Mussolini. The Allied victory was a result of a complex combination of factors, including industrial capacity, military strategy, manpower, and the resistance movements within occupied territories.",
  "timestamp": "2 July 2025 at 10:04:21 UTC+3"
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Json
IGNORE_WHEN_COPYING_END
4. notifications

Stores system-generated notifications for all users.

Example Document:

Generated json
{
  "createdAt": "1 July 2025 at 16:28:33 UTC+3",
  "message": "Your profile information has been successfully updated",
  "read": true,
  "title": "Profile Updated",
  "type": "success",
  "userId": "XZWglW3raHbG0fA7p4X20qe84O73"
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Json
IGNORE_WHEN_COPYING_END
5. specialities

Stores the list of available medical specialities in the system.

Example Document:

Generated json
{
  "description": "lungs",
  "name": "lungs"
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Json
IGNORE_WHEN_COPYING_END
6. users

This collection stores data for all user types, differentiated by the role field.

User Role: admin
Generated json
{
  "createdAt": "2025-06-01T18:21:49.581Z",
  "email": "shaalan8988@gmail.com",
  "geminiApiKey": "AIzaSyCENZOruE3alSIHFnXGuxMvbT1ib-d-nTg",
  "id": "7hpM5v4rNGcqonXGHfCgUJm1zcs1",
  "name": "ali shaalan",
  "phone": "",
  "profilePhoto": "",
  "role": "admin",
  "test": true,
  "timestamp": "2025-06-28T13:51:09.282Z",
  "updatedAt": "2025-06-01T18:21:49.581Z"
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Json
IGNORE_WHEN_COPYING_END
User Role: doctor
Generated json
{
  "address": {
    "city": "dahye",
    "state": "dahye",
    "street": "Main",
    "zipCode": "10001"
  },
  "age": 20,
  "appointments": 5,
  "biography": "adada",
  "bloodType": "O+",
  "certificates": [],
  "certifications": ["adads"],
  "createdAt": "2025-06-28T21:53:25.302Z",
  "email": "ibrahimdoctor@gmail.com",
  "geminiApiKey": "AIzaSyCENZOruE3alSIHFnXGuxMvbT1ib-d-nTg",
  "id": "kKNeqGobZJUZJ7zNwoszJyTicsi1",
  "isActive": true,
  "languages": ["adads"],
  "location": {
    "latitude": 40.69150156130757,
    "longitude": -73.935415070846
  },
  "name": "ibrahim akil doctor",
  "patients": 0,
  "phone": "70049615",
  "profilePhoto": "",
  "qualifications": ["adsasd"],
  "role": "doctor",
  "specialityId": "bXeZ8nFx90hIWPAliFxE",
  "status": "active",
  "updatedAt": "2 July 2025 at 09:57:35 UTC+3"
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Json
IGNORE_WHEN_COPYING_END
User Role: patient
Generated json
{
  "address": {
    "city": "1222",
    "state": "dahye",
    "street": "dahye",
    "zipCode": "222"
  },
  "age": 25,
  "allergies": ["peantues"],
  "assignedDoctor": null,
  "bloodType": "B+",
  "createdAt": "2025-06-28T22:17:06.161Z",
  "dob": "2000-03-03",
  "email": "ibrahimpatient@gmail.com",
  "emergencyContact": {
    "name": "ibrahim",
    "phone": "71921039",
    "relationship": "married"
  },
  "geminiApiKey": "AIzaSyCENZOruE3alSIHFnXGuxMvbT1ib-d-nTg",
  "gender": "male",
  "height": 170,
  "id": "w270t9IsmyXNqEuVcmMQw6vZksZ2",
  "insuranceInfo": {
    "groupNumber": "221212",
    "policyNumber": "harake",
    "provider": "nabih berre"
  },
  "lastVisit": null,
  "location": {
    "latitude": 40.71581770287453,
    "longitude": -73.97288106644035
  },
  "medicalConditions": ["diabitis"],
  "medications": ["panadol"],
  "name": "ibrahim akil patient",
  "phone": "70049615",
  "profilePhoto": "(base 64 url)",
  "role": "patient",
  "upcomingAppointment": {
    "date": "2025-07-08",
    "doctorName": "john smith ",
    "id": "8Qu5n5RgkOAngON8QDQh",
    "status": "pending",
    "time": "15:00"
  },
  "updatedAt": "2 July 2025 at 06:34:56 UTC+3",
  "weight": 78
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Json
IGNORE_WHEN_COPYING_END
User Roles & Scenarios
Admin Scenario

The admin has full control over the system and its users.

User Management:

Create, view, update, and delete Doctor profiles.

Create, view, update, and delete Patient profiles.

System Management:

Manage medical specialities (add, edit, delete).

Assign a speciality to each doctor.

View all system appointments.

AI Management:

Add and configure AI-powered doctors for specific specialities.

Provide a Gemini API key to enable AI functionality.

Test the AI doctors' capabilities.

Analytics & Visualization:

View system-wide statistics.

See the geographic locations of all doctors and patients on a map interface.

Doctor Scenario

The doctor manages their schedule, appointments, and patient interactions.

Dashboard & Analytics:

View personal statistics (e.g., number of appointments, patients).

Filter data as needed.

See recent notifications and upcoming appointments at a glance.

Availability Management:

Set their weekly schedule using the availability calendar.

Use quick templates or manually select available time slots.

Appointment Management:

View their appointment calendar.

Select an appointment to view details.

Edit/update appointment status (e.g., from "upcoming" to "completed").

Upload documents (attachedDocuments) relevant to the appointment.

AI-Powered Notes:

Utilize a feature that leverages the Gemini AI to analyze the appointment details and patient's history.

The AI generates two sets of notes:

Private Doctor Notes: For the doctor's internal records.

Patient-Facing Summary: A simplified summary for the patient.

Profile Management:

Manage personal and professional information, certifications, and qualifications.

View and manage their notifications.

Patient Scenario

The patient uses the platform to manage their health and book appointments.

Dashboard:

Log in to view a personal dashboard summarizing their health data, medical conditions, medications, and upcoming appointments.

Appointment Booking:

Search for doctors and view their profiles and specialities.

Book an appointment with a human doctor based on their availability.

Alternatively, interact with an AI specialist:

Chat with the main "general-ai-doctor".

Select a specific AI specialist (e.g., AI Cardiologist) for a consultation.

Profile Management:

Update personal information, medical history, emergency contacts, etc.

Core System Logic & Constraints

Appointment Uniqueness: The system must prevent double-booking. A specific doctor cannot have two appointments at the same time. A specific patient cannot have two appointments at the same time.

Availability Constraint: A patient can only book an appointment with a doctor during a time slot that the doctor has marked as true in their availability schedule.

AI Note Generation: The AI integration (Gemini) is a key feature for doctors, designed to streamline documentation by automatically generating notes from appointment data.

Role-Based Access Control (RBAC): Functionality is strictly segregated based on the user's role (admin, doctor, patient).