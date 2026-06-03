import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart } from 'lucide-react';

const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
          <span className="font-black text-slate-800">Havagr8day!</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6 text-slate-700">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1">HavaGr8Day Bingo Privacy Policy</h1>
          <p className="text-sm text-slate-400">Last Updated: June 1, 2026</p>
        </div>

        <p>
          At HavaGr8Day Bingo, we believe kindness starts with trust. This Privacy Policy explains
          what information we collect, how we use it, and the choices you have regarding your personal
          information.
        </p>
        <p>By using HavaGr8Day Bingo, you agree to the practices described in this Privacy Policy.</p>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">1. Information We Collect</h2>
          <p className="mb-2">We may collect the following information:</p>

          <h3 className="font-semibold text-slate-800 mt-3 mb-1">Information You Provide</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Name</li>
            <li>Email address</li>
            <li>Username</li>
            <li>Profile information</li>
            <li>Photos or images you upload</li>
            <li>Comments, stories, testimonials, or messages you submit</li>
            <li>Information submitted when claiming prizes or rewards</li>
          </ul>

          <h3 className="font-semibold text-slate-800 mt-3 mb-1">Information Collected Automatically</h3>
          <p className="mb-2">When you visit our website, we may automatically collect:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>IP address</li>
            <li>Browser type</li>
            <li>Device type</li>
            <li>Operating system</li>
            <li>Pages viewed</li>
            <li>Time spent on the website</li>
            <li>Referring websites</li>
            <li>General geographic location</li>
          </ul>

          <h3 className="font-semibold text-slate-800 mt-3 mb-1">Cookies and Similar Technologies</h3>
          <p className="mb-2">We may use cookies and similar technologies to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Keep you logged in</li>
            <li>Remember preferences</li>
            <li>Improve site performance</li>
            <li>Measure usage and engagement</li>
            <li>Enhance user experience</li>
          </ul>
          <p className="mt-2">
            You may disable cookies through your browser settings, although some features may not
            function properly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">2. How We Use Information</h2>
          <p className="mb-2">We may use your information to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Create and manage your account</li>
            <li>Operate the HavaGr8Day Bingo platform</li>
            <li>Track game participation and achievements</li>
            <li>Award prizes and rewards</li>
            <li>Respond to inquiries and support requests</li>
            <li>Improve our services and user experience</li>
            <li>Communicate updates, promotions, and announcements</li>
            <li>Protect the safety and security of our community</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">3. Sharing of Information</h2>
          <p>We do not sell your personal information.</p>
          <p className="mt-2">We may share information:</p>

          <h3 className="font-semibold text-slate-800 mt-3 mb-1">With Service Providers</h3>
          <p className="mb-2">Trusted third-party providers may assist with:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Website hosting</li>
            <li>Email delivery</li>
            <li>Analytics</li>
            <li>Payment processing</li>
            <li>Customer support</li>
            <li>Prize fulfillment</li>
          </ul>
          <p className="mt-2">
            These providers may only use information as necessary to perform services on our behalf.
          </p>

          <h3 className="font-semibold text-slate-800 mt-3 mb-1">For Legal Reasons</h3>
          <p className="mb-2">We may disclose information if required by law or when necessary to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Comply with legal obligations</li>
            <li>Protect our rights</li>
            <li>Investigate fraud or abuse</li>
            <li>Protect the safety of users or the public</li>
          </ul>

          <h3 className="font-semibold text-slate-800 mt-3 mb-1">Business Transfers</h3>
          <p>
            If HavaGr8Day Bingo is sold, merged, reorganized, or transferred, user information may be
            included as part of that transaction.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">4. User Content</h2>
          <p className="mb-2">
            If you choose to submit stories, photos, comments, testimonials, or descriptions of
            completed deeds:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>You control what you choose to share.</li>
            <li>Avoid posting sensitive personal information.</li>
            <li>Content you make public may be visible to other users.</li>
          </ul>
          <p className="mt-2">
            Please be respectful of the privacy of others and obtain permission before posting
            identifiable photos or information about another person.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">5. Prize Winners</h2>
          <p>
            If you win a prize, we may request information necessary to verify eligibility and deliver
            the prize.
          </p>
          <p className="mt-2">
            With your consent, we may also publish your first name, city, province/state, photo,
            testimonial, or winning story for promotional purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">6. Children's Privacy</h2>
          <p>HavaGr8Day Bingo is not directed toward children under the age of 13.</p>
          <p className="mt-2">
            We do not knowingly collect personal information from children under 13. If we become
            aware that such information has been collected, we will take reasonable steps to remove it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">7. Data Security</h2>
          <p>
            We take reasonable administrative, technical, and organizational measures to protect
            personal information.
          </p>
          <p className="mt-2">
            However, no website, platform, or transmission method can be guaranteed to be completely
            secure. Users provide information at their own risk.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">8. Data Retention</h2>
          <p className="mb-2">We retain personal information only as long as reasonably necessary to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide our services</li>
            <li>Meet legal obligations</li>
            <li>Resolve disputes</li>
            <li>Enforce agreements</li>
          </ul>
          <p className="mt-2">
            When information is no longer required, we will take reasonable steps to securely delete or
            anonymize it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">9. Your Rights</h2>
          <p className="mb-2">
            Depending on your location, you may have rights regarding your personal information,
            including:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Accessing your information</li>
            <li>Correcting inaccurate information</li>
            <li>Requesting deletion of your information</li>
            <li>Withdrawing consent where applicable</li>
            <li>Requesting information about how your data is used</li>
          </ul>
          <p className="mt-2">
            To exercise these rights, please contact us using the information below.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">10. Third-Party Links</h2>
          <p>The website may contain links to third-party websites or services.</p>
          <p className="mt-2">
            We are not responsible for the privacy practices, content, or security of those
            third-party sites.
          </p>
          <p className="mt-2">
            Users should review the privacy policies of any third-party websites they visit.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">11. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time.</p>
          <p className="mt-2">
            Any updates will be posted on this page with a revised "Last Updated" date.
          </p>
          <p className="mt-2">
            Continued use of the Service after changes are posted constitutes acceptance of the updated
            policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-2">12. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or your personal information, please
            contact:
          </p>
          <address className="mt-2 not-italic text-slate-600">
            HavaGr8Day Bingo<br />
            Ontario, Canada<br />
            <a href="mailto:support@havagr8day.com" className="text-indigo-600 underline underline-offset-2">
              support@havagr8day.com
            </a>
            <br />
            <a href="https://www.havagr8day.com" className="text-indigo-600 underline underline-offset-2">
              www.havagr8day.com
            </a>
          </address>
        </section>

        <p className="pt-4 pb-8 text-slate-500 italic text-center">
          Thank you for being part of a community dedicated to making every day a little brighter.
        </p>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
