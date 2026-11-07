"use strict";
(() => {
  async function setup(){
    const form=document.querySelector("#contact-form");
    if(!form)return;
    const button=form.querySelector('button[type="submit"]');
    const status=document.querySelector("#contact-status");
    const setStatus=(text,good=false)=>{
      status.textContent=text;
      status.dataset.state=good?"success":"neutral";
    };
    button.disabled=true;
    setStatus("Checking secure message delivery…");
    try{
      const response=await fetch("/api/contact/health",{cache:"no-store"});
      if(!response.ok)throw Error("Contact endpoint offline");
      button.disabled=false;
      setStatus("Contact form is ready.");
    }catch(_){
      setStatus("The contact form is not yet available. Secure message delivery must be activated on the server.");
    }
    form.addEventListener("submit",async event=>{
      event.preventDefault();
      if(button.disabled)return;
      const name=form.elements.namedItem("name").value.trim();
      const email=form.elements.namedItem("email").value.trim();
      const message=form.elements.namedItem("message").value.trim();
      const website=form.elements.namedItem("website").value.trim();
      if(name.length>100||email.length>254||message.length<10||message.length>5000){
        setStatus("Please check the fields: message length must be 10–5000 characters.");
        return;
      }
      button.disabled=true;
      setStatus("Sending message…");
      try{
        const response=await fetch("/api/contact",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          credentials:"same-origin",
          body:JSON.stringify({name,email,message,website})
        });
        const result=await response.json();
        if(!response.ok)throw Error(result.message||"Message could not be sent.");
        setStatus("Message sent. Thank you for contacting Mondoskopo.",true);
        form.reset();
      }catch(err){
        setStatus(err?.message||"Unable to deliver the message. Please try again.");
      }finally{
        button.disabled=false;
      }
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup);
  else setup();
})();