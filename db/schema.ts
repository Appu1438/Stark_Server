import mongoose from "mongoose";

const { Schema } = mongoose;

const adminSchema = new Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: {
    type: String,
    enum: ["Moderator", "Admin", "SuperAdmin"],
    default: "Admin"
  },
  status: { type: String, default: "active" },
  phone: String,
  profileImage: String,

  // 🔑 Identity Verification
  identityType: {
    type: String,
    enum: ["Aadhar", "PAN", "Passport", "Driving License", "Other"],
    default: "Other"
  },
  identityNumber: { type: String },
  identityDocument: { type: String }, // URL to uploaded file/image
  isVerified: { type: Boolean, default: false },
  address: { type: String },
  dob: { type: Date },
  gender: { type: String, enum: ["Male", "Female", "Other"] },


  // 🏢 Branch/Location
  city: { type: String },
  branch: { type: String },
  state: { type: String },
  country: { type: String, default: "India" },

  // 📅 Login/Access Tracking
  lastLoggedIn: Date,
  lastLoggedOut: Date,
  lastIp: String,
  loginAttempts: { type: Number, default: 0 },
  lockedUntil: Date,

  // 📝 Audit
  createdBy: { type: Schema.Types.ObjectId, ref: "admin" },
  updatedBy: { type: Schema.Types.ObjectId, ref: "admin" },
},
  { timestamps: true }
);

const adminAuditLogSchema = new Schema({
  adminId: { type: Schema.Types.ObjectId, ref: "admin", unique: true },
  history: [
    {
      action: { type: String, trim: true, required: true },
      actionBy: { type: Schema.Types.ObjectId, ref: "admin" },
      actionOn: { type: Date, default: Date.now },
      remark: { type: String, trim: true, required: true } // ✅ optional remark

    }
  ]
});
const driverAuditLogSchema = new Schema({
  driverId: { type: Schema.Types.ObjectId, ref: "driver", unique: true },
  history: [
    {
      action: { type: String, trim: true, required: true },
      actionBy: { type: Schema.Types.ObjectId, ref: "admin" },
      actionOn: { type: Date, default: Date.now },
      remark: { type: String, trim: true, required: true } // ✅ optional remark

    }
  ]
});

const driverSchema = new Schema({
  name: String,
  email: { type: String, unique: true },
  phone_number: { type: String, unique: true },
  profilePic: String,
  country: String,
  city: String,
  address: String,
  aadhar: String,
  dob: Date,
  gender: { type: String, enum: ["Male", "Female", "Other"] },

  notificationToken: String,
  activeDevice: {
    fingerprint: { type: String, default: null },
    brand: { type: String, default: null },
    model: { type: String, default: null },
    osName: { type: String, default: null },
    osBuildId: { type: String, default: null },
  },

  vehicle_type: { type: String, enum: ["Hatchback", "Sedan", "Suv"] },
  registration_number: { type: String, unique: true },
  registration_date: Date,
  driving_license: String,
  license_expiry: Date,
  vehicle_color: String,
  capacity: String,
  insurance_number: String,
  insurance_expiry: Date,

  status: { type: String, default: "inactive", enum: ["active", "inactive"] },
  lastActive: {
    type: Date,
    default: Date.now,
  }, 
    
  is_approved: { type: Boolean, default: true },
  pending_suspension: { type: Boolean, default: false },


  ratings: { type: Number, default: 0 }, // average rating
  totalRatings: { type: Number, default: 0 }, // number of ratings received

  totalEarning: { type: Number, default: 0 },
  totalShare: { type: Number, default: 0 },
  totalRides: { type: Number, default: 0 },
  pendingRides: { type: Number, default: 0 },
  cancelRides: { type: Number, default: 0 },

}, { timestamps: true });


const rideSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "user" },
    driverId: { type: Schema.Types.ObjectId, ref: "driver" },
    totalFare: Number,
    driverEarnings: Number,
    platformShare: Number,
    currentLocationName: String,
    destinationLocationName: String,

    currentLocation: {
      name: String,
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },

    destinationLocation: {
      name: String,
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },

    distance: String,
    status: {
      type: String,
      enum: ["Booked", "Processing", "Arrived", "Ongoing", "Reached", "Completed", "Cancelled", "Cancelled-Midway"],
      default: "Booked",
    },

    rating: Number,
    driverRating: Number,
    userRating: Number,

    otp: { type: Number, required: false }, // made optional on creation

    cancelDetails: {
      cancelledBy: { type: String, enum: ["user", "driver", "system"], default: null },
      reason: { type: String, default: null },
      totalFare: Number,
      driverEarnings: Number,
      platformShare: Number,
      refundedAmount: Number,
      travelledDistance: { type: Number, default: 0 },
      cancelledLocationName: String,
      cancelledLocation: {
        name: String,
        latitude: { type: Number },
        longitude: { type: Number },
      },
      cancelledAt: { type: Date, default: null },
    },

  },
  { timestamps: true }
);

const userSchema = new Schema({
  name: String,
  phone_number: { type: String, unique: true },
  email: { type: String, unique: true },
  notificationToken: String,

  is_approved: { type: Boolean, default: true },

  totalRatings: { type: Number, default: 0 },
  ratings: { type: Number, default: 0 },

  savedPlaces: [
    {
      placeId: String,
      label: String,
      address: String,
      location: {
        latitude: Number,
        longitude: Number
      }
    }
  ],

  totalRides: { type: Number, default: 0 },
  pendingRides: { type: Number, default: 0 },
  cancelRides: { type: Number, default: 0 },
  
}, { timestamps: true });

const transactionSchema = new Schema(
  {
    driverId: { type: Schema.Types.ObjectId, ref: "driver", required: true },
    grossAmount: { type: Number, required: true },
    netAmount: { type: Number, required: true },
    paymentId: { type: String }, // Stripe PaymentIntent ID
    status: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
    details: { type: Object }, // store raw stripe response if needed
    actionOn: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const driverWalletSchema = new Schema(
  {
    driverId: { type: Schema.Types.ObjectId, ref: "driver", required: true, unique: true },
    balance: { type: Number, default: 0 }, // Current wallet balance

    history: [
      {
        type: {
          type: String,
          enum: ["credit", "debit"],
          required: true,
        }, // credit = recharge, debit = deduction

        action: {
          type: String,
          enum: ["recharge", "platform_fee", "ride_payment", "refund", "adjustment"],
          required: true,
        },

        amount: { type: Number, required: true }, // always positive

        referenceId: { type: String }, // orderId, rideId, etc.
        meta: { type: Object }, // optional (ride details, fee breakdown, etc.)

        balanceAfter: { type: Number, required: true }, // running balance after this transaction
        actionOn: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const fareSchema = new Schema({
  vehicle_type: { type: String, enum: ["Auto", "Hatchback", "Sedan", "Suv"], required: true },
  baseFare: { type: Number, default: 0 },
  perKmRate: { type: Number, default: 0 },
  perMinRate: { type: Number, default: 0 },
  minFare: { type: Number, default: 0 },
  surgeMultiplier: { type: Number, default: 1 }, // optional: for dynamic pricing

  district: { type: String, default: 'Default' }, // mark if this fare set is active
}, { timestamps: true });



const complaintSchema = new Schema(
  {
    // Who registered the complaint
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "userType", // Dynamic reference (User or Driver)
      required: true,
    },

    // Determines whether it's a User or Driver
    userType: {
      type: String,
      enum: ["User", "Driver"],
      required: true,
    },

    // Optional: Link the complaint to a ride if relevant
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ride",
      default: null,
    },

    // Type of issue
    category: {
      type: String,
      enum: [
        "Ride Issue",
        "Payment Issue",
        "Driver Behavior",
        "Customer Behavior",
        "App Issue",
        "Other",
      ],
      required: true,
    },

    // User’s complaint message
    message: {
      type: String,
      required: true,
      trim: true,
    },

    // Complaint status
    status: {
      type: String,
      enum: ["Pending", "In Review", "Resolved", "Rejected"],
      default: "Pending",
    },

    // Optional: Admin response or resolution note
    adminResponse: {
      type: String,
      default: "",
      trim: true,
    },
    adminHandledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "admin",
      default: null,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    // Optional: date when resolved
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true } // adds createdAt and updatedAt
);


export const Complaint = mongoose.model("Complaint", complaintSchema);

export const Fare = mongoose.model("Fare", fareSchema);

export const DriverWallet = mongoose.model("driver_wallet", driverWalletSchema);

export const Transaction = mongoose.model("transaction", transactionSchema);
export const admin = mongoose.model("admin", adminSchema);
export const adminAuditLog = mongoose.model("adminauditlog", adminAuditLogSchema);
export const driver = mongoose.model("driver", driverSchema);
export const driverAuditLog = mongoose.model("driverauditlog", driverAuditLogSchema);
export const Ride = mongoose.model("ride", rideSchema);
export const User = mongoose.model("user", userSchema);
