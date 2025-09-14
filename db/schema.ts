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

  vehicle_type: { type: String, enum: ["Hatchback", "Sedan", "Suv"] },
  registration_number: { type: String, unique: true },
  registration_date: Date,
  driving_license: String,
  license_expiry: Date,
  vehicle_color: String,
  capacity: String,
  insurance_number: String,
  insurance_expiry: Date,

  baseFare: { type: Number, default: 0 },
  perKmRate: { type: Number, default: 0 },
  perMinRate: { type: Number, default: 0 },
  minFare: { type: Number, default: 0 },

  status: { type: String, default: "inactive", enum: ["active", "inactive"] },
  is_approved: { type: Boolean, default: false },

  ratings: { type: Number, default: 0 },
  // wallet: { type: Number, default: 0 },
  totalEarning: { type: Number, default: 0 },
  totalShare: { type: Number, default: 0 },
  totalRides: { type: Number, default: 0 },
  pendingRides: { type: Number, default: 0 },
  cancelRides: { type: Number, default: 0 },

}, { timestamps: true });


const rideSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "user" },
  driverId: { type: Schema.Types.ObjectId, ref: "driver" },
  totalFare: Number,
  driverEarnings: Number,
  platformShare: Number,
  currentLocationName: String,
  destinationLocationName: String,
  distance: String,
  status: String,
  rating: Number,
}, { timestamps: true });

const userSchema = new Schema({
  name: String,
  phone_number: { type: String, unique: true },
  email: { type: String, unique: true },
  notificationToken: String,
  ratings: { type: Number, default: 0 },
  totalRides: { type: Number, default: 0 },
}, { timestamps: true });

const transactionSchema = new Schema(
  {
    driverId: { type: Schema.Types.ObjectId, ref: "driver", required: true },
    amount: { type: Number, required: true },
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

export const DriverWallet = mongoose.model("driver_wallet", driverWalletSchema);

export const Transaction = mongoose.model("transaction", transactionSchema);
export const admin = mongoose.model("admin", adminSchema);
export const adminAuditLog = mongoose.model("adminauditlog", adminAuditLogSchema);
export const driver = mongoose.model("driver", driverSchema);
export const driverAuditLog = mongoose.model("driverauditlog", driverAuditLogSchema);
export const Ride = mongoose.model("ride", rideSchema);
export const User = mongoose.model("user", userSchema);
